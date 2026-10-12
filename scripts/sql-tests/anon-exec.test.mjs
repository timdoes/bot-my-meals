// SQL tests: revoke-anon sweep. A migrated function loses anon execute; excluded names keep it.
// In-memory Postgres (PGlite), synthetic data only. `npm run test:sql`
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const REVOKE = "20261011235900_revoke_anon_rpcs.sql";

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

function anonExec(db, sig) {
  return db.query(`select has_function_privilege('anon', $1::regprocedure, 'execute') as ok`, [sig]).then((r) => r.rows[0].ok);
}

describe("revoke anon execute", () => {
  it("a migrated function loses anon; peek_join_token and a managed exclude keep it", async () => {
    const db = await freshDb();
    assert.equal(await anonExec(db, "public.lock_week(uuid)"), false);
    assert.equal(await anonExec(db, "public.peek_join_token(text)"), true);

    await db.exec(`
      create or replace function public.managed_host_gate() returns boolean language sql as $$ select true $$;
      grant execute on function public.managed_host_gate() to anon;
      grant execute on function public.lock_week(uuid) to anon;
    `);
    assert.equal(await anonExec(db, "public.lock_week(uuid)"), true);
    assert.equal(await anonExec(db, "public.managed_host_gate()"), true);

    await db.exec(fs.readFileSync(path.join(migDir, REVOKE), "utf8"));
    assert.equal(await anonExec(db, "public.lock_week(uuid)"), false);
    assert.equal(await anonExec(db, "public.peek_join_token(text)"), true);
    assert.equal(await anonExec(db, "public.managed_host_gate()"), true);
    await db.close();
  });
});
