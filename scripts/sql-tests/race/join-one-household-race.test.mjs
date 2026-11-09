// Two-session PostgreSQL regression: overlapping join_household_by_code
// transactions cannot create a second household membership.
// PGlite is single-connection and cannot prove this. `npm run test:sql:race`
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../../supabase/migrations");
const ADMIN_URL =
  process.env.JOIN_RACE_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const TEST_DB = "bmm_join_race";

const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select current_setting('request.jwt.claim.role', true)
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema if not exists extensions;
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const ownerA = id(11);
const ownerB = id(12);
const joiner = id(13);

function withDbName(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function execSql(client, sql) {
  await client.query(sql);
}

async function migrate(client) {
  await execSql(client, STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    const sql = fs.readFileSync(path.join(migDir, f), "utf8");
    await execSql(client, sql);
  }
}

async function seedHouses(client) {
  await execSql(
    client,
    `
    insert into auth.users(id,email) values
      ('${ownerA}','oa@example.test'),
      ('${ownerB}','ob@example.test'),
      ('${joiner}','join@example.test');
    insert into public.households(id,name,invite_code) values
      ('${A}','House A','CODEAA'),
      ('${B}','House B','CODEBB');
    insert into public.memberships(household_id,user_id,role,display_name,email) values
      ('${A}','${ownerA}','owner','Owner A','oa@example.test'),
      ('${B}','${ownerB}','owner','Owner B','ob@example.test');
    `,
  );
}

async function setUid(client, uid) {
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
}

async function resetRole(client) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claim.sub', '', false)");
}

async function waitUntilLockWait(watch, pid) {
  for (let i = 0; i < 100; i++) {
    const { rows } = await watch.query(
      `select count(*)::int as n from pg_locks where pid = $1 and not granted`,
      [pid],
    );
    if (rows[0]?.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("second session never waited on unique(user_id)");
}

async function overlappingJoin(url, mode) {
  const t1 = new Client({ connectionString: url });
  const t2 = new Client({ connectionString: url });
  const watch = new Client({ connectionString: url });
  await t1.connect();
  await t2.connect();
  await watch.connect();
  try {
    const pid2 = (await t2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await t1.query("BEGIN");
    await setUid(t1, joiner);
    await t1.query("select public.join_household_by_code($1)", ["CODEAA"]);

    await t2.query("BEGIN");
    await t2.query("set lock_timeout = '8s'");
    await setUid(t2, joiner);

    if (mode === "wait-for-lock") {
      const t2Join = t2.query("select public.join_household_by_code($1)", ["CODEBB"]).then(
        (res) => ({ ok: true, res }),
        (err) => ({ ok: false, err }),
      );
      await waitUntilLockWait(watch, pid2);
      await t1.query("COMMIT");
      await resetRole(t1);
      const t2Result = await t2Join;
      let t2Error = null;
      if (t2Result.ok) {
        await t2.query("COMMIT");
      } else {
        t2Error = t2Result.err;
        try {
          await t2.query("ROLLBACK");
        } catch {
          /* already aborted */
        }
      }
      await resetRole(t2).catch(() => {});
      const count = await watch.query(
        "select count(*)::int as n from public.memberships where user_id = $1",
        [joiner],
      );
      return { t2Error, n: count.rows[0].n };
    }

    await t2.query("select public.join_household_by_code($1)", ["CODEBB"]);
    await t2.query("COMMIT");
    await t1.query("COMMIT");
    await resetRole(t1);
    await resetRole(t2);
    const count = await watch.query(
      "select count(*)::int as n from public.memberships where user_id = $1",
      [joiner],
    );
    return { t2Error: null, n: count.rows[0].n };
  } finally {
    await t1.end().catch(() => {});
    await t2.end().catch(() => {});
    await watch.end().catch(() => {});
  }
}

describe("two-session one-household join", { concurrency: 1 }, () => {
  let admin;
  let dbUrl;

  before(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    try {
      await admin.connect();
    } catch (err) {
      throw new Error(
        `two-session join race test needs PostgreSQL at JOIN_RACE_DATABASE_URL (or ${ADMIN_URL}): ${err.message}`,
      );
    }
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [TEST_DB],
    );
    await admin.query(`drop database if exists ${TEST_DB}`);
    await admin.query(`create database ${TEST_DB}`);
    dbUrl = withDbName(ADMIN_URL, TEST_DB);
    const setup = new Client({ connectionString: dbUrl });
    await setup.connect();
    try {
      await migrate(setup);
      await seedHouses(setup);
    } finally {
      await setup.end();
    }
  });

  after(async () => {
    if (!admin) return;
    try {
      await admin.query(
        `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
        [TEST_DB],
      );
      await admin.query(`drop database if exists ${TEST_DB}`);
    } catch {
      /* best-effort cleanup */
    }
    await admin.end().catch(() => {});
  });

  it("overlapping join_household_by_code waits on unique(user_id) then raises already-in-a-house", async () => {
    const { t2Error, n } = await overlappingJoin(dbUrl, "wait-for-lock");
    assert.ok(t2Error, "second session should fail after the first commits");
    assert.match(String(t2Error.message), /You are already in a house\./);
    assert.equal(n, 1);
  });

  it("dropping unique(user_id) lets overlapping joins commit two memberships", async () => {
    const reset = new Client({ connectionString: dbUrl });
    await reset.connect();
    try {
      await reset.query("delete from public.memberships where user_id = $1", [joiner]);
      await reset.query("alter table public.memberships drop constraint memberships_one_user");
    } finally {
      await reset.end();
    }

    const { t2Error, n } = await overlappingJoin(dbUrl, "commit-second-first");
    assert.equal(t2Error, null, "without unique(user_id) the second insert is the TOCTOU");
    assert.equal(n, 2);
  });
});
