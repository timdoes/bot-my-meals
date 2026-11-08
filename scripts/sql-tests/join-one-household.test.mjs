// SQL tests: claim_pending_invites and join_household_by_code refuse a second house.
// In-memory Postgres (PGlite). `npm run test:sql`
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");

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

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const rows = (db, sql, params) => db.query(sql, params).then((r) => r.rows);

async function freshDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
  return db;
}

async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  }
}

describe("one household join", () => {
  const A = id(1);
  const B = id(2);
  const ownerA = id(11);
  const ownerB = id(12);
  const member = id(13);
  const newbie = id(14);

  async function twoHouses(db) {
    await db.exec(`
      insert into auth.users(id,email) values
        ('${ownerA}','oa@example.test'),
        ('${ownerB}','ob@example.test'),
        ('${member}','sam@example.test'),
        ('${newbie}','new@example.test');
      insert into public.households(id,name,invite_code) values
        ('${A}','House A','CODEAA'),
        ('${B}','House B','CODEBB');
      insert into public.memberships(household_id,user_id,role,display_name,email) values
        ('${A}','${ownerA}','owner','Owner A','oa@example.test'),
        ('${B}','${ownerB}','owner','Owner B','ob@example.test'),
        ('${A}','${member}','voter','Sam','sam@example.test');
    `);
  }

  it("join_household_by_code raises when the user is already in another house", async () => {
    const db = await freshDb();
    await twoHouses(db);
    await assert.rejects(
      () => asUser(db, member, () => db.query(`select public.join_household_by_code('CODEBB')`)),
      /You are already in a house\./,
    );
    const houses = await rows(
      db,
      `select household_id from public.memberships where user_id=$1 order by created_at`,
      [member],
    );
    assert.deepEqual(houses.map((row) => row.household_id), [A]);
    await db.close();
  });

  it("claim_pending_invites does not add a second membership", async () => {
    const db = await freshDb();
    await twoHouses(db);
    await db.exec(`
      insert into public.household_invites(household_id,display_name,email,role)
      values ('${B}','Sam','sam@example.test','voter');
    `);
    await assert.rejects(
      () => asUser(db, member, () => db.query(`select public.claim_pending_invites()`)),
      /You are already in a house\./,
    );
    const houses = await rows(
      db,
      `select household_id from public.memberships where user_id=$1`,
      [member],
    );
    assert.equal(houses.length, 1);
    assert.equal(houses[0].household_id, A);
    await db.close();
  });

  it("claim_pending_invites still joins the first house when the user has none", async () => {
    const db = await freshDb();
    await twoHouses(db);
    await db.exec(`
      insert into public.household_invites(household_id,display_name,email,role)
      values ('${B}','New','new@example.test','voter');
    `);
    await asUser(db, newbie, () => db.query(`select public.claim_pending_invites()`));
    const houses = await rows(
      db,
      `select household_id from public.memberships where user_id=$1`,
      [newbie],
    );
    assert.deepEqual(houses.map((row) => row.household_id), [B]);
    await db.close();
  });

  it("join_household_by_code is a no-op when already in that house", async () => {
    const db = await freshDb();
    await twoHouses(db);
    const [row] = await asUser(db, member, () =>
      rows(db, `select public.join_household_by_code('CODEAA') as hid`),
    );
    assert.equal(row.hid, A);
    const houses = await rows(db, `select count(*)::int as n from public.memberships where user_id=$1`, [member]);
    assert.equal(houses[0].n, 1);
    await db.close();
  });

  it("pg_get_functiondef has the same already-in-a-house exception on both RPCs", async () => {
    const db = await freshDb();
    const [{ pendingSrc }] = await rows(
      db,
      `select pg_get_functiondef('public.claim_pending_invites()'::regprocedure) as "pendingSrc"`,
    );
    const [{ codeSrc }] = await rows(
      db,
      `select pg_get_functiondef('public.join_household_by_code(text)'::regprocedure) as "codeSrc"`,
    );
    assert.match(pendingSrc, /You are already in a house\./);
    assert.match(codeSrc, /You are already in a house\./);
    await db.close();
  });
});
