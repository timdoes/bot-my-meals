// SQL tests: revoke-PUBLIC follow-up. A function with the default PUBLIC grant (older-migration
// style) loses anon and PUBLIC execute; authenticated keeps it; excluded names keep anon;
// a trigger function still fires. In-memory Postgres (PGlite). `npm run test:sql`
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const REVOKE_ANON = "20261011235900_revoke_anon_rpcs.sql";
const REVOKE_PUBLIC = "20261012020000_revoke_public_execute.sql";
const VERIFY = path.join(here, "../../supabase/verify_public_execute.sql");
const SAMPLE = "public.revoke_public_sample()";
const TRIGGER_FN = "public.revoke_public_trg()";

const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema if not exists extensions;
create publication supabase_realtime;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

async function freshDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
  return db;
}

function roleExec(db, role, sig) {
  return db.query(`select has_function_privilege($1, $2::regprocedure, 'execute') as ok`, [role, sig]).then((r) => r.rows[0].ok);
}

function publicExec(db, sig) {
  return db.query(
    `select exists (
       select 1
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = $1::regprocedure
         and a.grantee = 0
         and a.privilege_type = 'EXECUTE'
     ) as ok`,
    [sig],
  ).then((r) => r.rows[0].ok);
}

function authExecTotal(db) {
  return db.query(`
    select count(*)::int as n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('authenticated', p.oid, 'execute')
  `).then((r) => r.rows[0].n);
}

describe("revoke public execute", () => {
  it("default PUBLIC grant: anon and PUBLIC lose execute; authenticated keeps it; excludes and trigger hold", async () => {
    const db = await freshDb();

    await db.exec(`
      create function public.revoke_public_sample() returns boolean language sql as $$ select true $$;
      create or replace function public.managed_host_gate() returns boolean language sql as $$ select true $$;
      grant execute on function public.managed_host_gate() to anon;
      create table public.revoke_public_probe (id int primary key, n int not null default 0);
      create function public.revoke_public_trg() returns trigger language plpgsql as $$
      begin
        new.n := 1;
        return new;
      end $$;
      create trigger revoke_public_probe_trg
        before insert on public.revoke_public_probe
        for each row execute function public.revoke_public_trg();
    `);

    assert.equal(await publicExec(db, SAMPLE), true);
    assert.equal(await roleExec(db, "anon", SAMPLE), true);
    assert.equal(await roleExec(db, "authenticated", SAMPLE), true);

    await db.exec(fs.readFileSync(path.join(migDir, REVOKE_ANON), "utf8"));
    // Earlier revoke-from-anon leaves the default PUBLIC grant, so anon still has execute.
    assert.equal(await publicExec(db, SAMPLE), true);
    assert.equal(await roleExec(db, "anon", SAMPLE), true);
    assert.equal(await roleExec(db, "authenticated", SAMPLE), true);

    const authBefore = await authExecTotal(db);
    await db.exec(fs.readFileSync(path.join(migDir, REVOKE_PUBLIC), "utf8"));
    assert.equal(await authExecTotal(db), authBefore);

    assert.equal(await roleExec(db, "anon", SAMPLE), false);
    assert.equal(await publicExec(db, SAMPLE), false);
    assert.equal(await publicExec(db, TRIGGER_FN), false);
    assert.equal(await roleExec(db, "authenticated", SAMPLE), true);

    assert.equal(await roleExec(db, "anon", "public.peek_join_token(text)"), true);
    assert.equal(await roleExec(db, "anon", "public.managed_host_gate()"), true);

    await db.exec(`insert into public.revoke_public_probe(id) values (1)`);
    const fired = await db.query(`select n from public.revoke_public_probe where id = 1`);
    assert.equal(fired.rows[0].n, 1);

    const verify = await db.query(fs.readFileSync(VERIFY, "utf8"));
    assert.equal(Number(verify.rows[0].anon_exec), 0);
    assert.equal(Number(verify.rows[0].public_exec), 0);

    await db.close();
  });
});
