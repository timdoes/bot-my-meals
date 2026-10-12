// SQL test for 20261012040000_recipes_member_read.sql (FIX2).
// Editing a meal in an unlocked week inserts a recipe with RETURNING; that needs a member SELECT policy.
// PGlite, synthetic houses A and B only. No network, no real data, no secrets.
//   npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const FILE = "20261012040000_recipes_member_read.sql";

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
-- Supabase gives signed-in roles table privileges in public by default; the migrations then narrow them.
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { aOwner: id(101), aVoter: id(102), bOwner: id(201) };
const H = { a: id(1), b: id(2) };
let db;
let meal;

async function asUser(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

before(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    const sql = fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, "");
    await db.exec(sql);
  }
  await db.exec(`
    insert into auth.users(id,email) values
      ('${U.aOwner}','a1@example.test'),('${U.aVoter}','a2@example.test'),('${U.bOwner}','b1@example.test');
    insert into public.households(id,name) values ('${H.a}','House A'),('${H.b}','House B');
    insert into public.memberships(household_id,user_id,role,display_name,email) values
      ('${H.a}','${U.aOwner}','owner','Alex','a1@example.test'),
      ('${H.a}','${U.aVoter}','voter','Robin','a2@example.test'),
      ('${H.b}','${U.bOwner}','owner','Bea','b1@example.test');
  `);
  const [wk] = await q(`insert into public.weeks(household_id,starts_on,status,night_headcounts)
    values ('${H.a}','2030-01-06','voting','{2,2,2,2,2,2,2}') returning id`);
  [meal] = await q(
    `insert into public.meals(household_id,week_id,day_index,night_date,title,audience,servings)
     values ($1,$2,2,'2030-01-08','Test soup','couple',2) returning id`,
    [H.a, wk.id],
  );
});

after(async () => db?.close());

describe("recipes member read (FIX2)", () => {
  it("a member can insert a recipe with RETURNING in an unlocked week", async () => {
    const rows = await asUser(U.aVoter, () =>
      q(`insert into public.recipes(household_id,meal_id,servings,prep_minutes,cook_minutes,steps)
         values ($1,$2,2,10,20,'["Cook and serve."]'::jsonb) returning id`, [H.a, meal.id]),
    );
    assert.equal(rows.length, 1);
  });

  it("members read their own house's recipes; other houses see none", async () => {
    const mine = await asUser(U.aOwner, () => q(`select id from public.recipes where meal_id=$1`, [meal.id]));
    assert.equal(mine.length, 1);
    const other = await asUser(U.bOwner, () => q(`select id from public.recipes where meal_id=$1`, [meal.id]));
    assert.equal(other.length, 0);
  });

  it("is_household_member stays authenticated-only and the file is idempotent", async () => {
    await db.exec(fs.readFileSync(path.join(migDir, FILE), "utf8"));
    const [r] = await q(`select
      has_function_privilege('authenticated','public.is_household_member(uuid)','execute') as auth,
      has_function_privilege('anon','public.is_household_member(uuid)','execute') as anon,
      (select count(*)::int from pg_policies where tablename='recipes' and policyname='recipes_member_read') as n`);
    assert.deepEqual(r, { auth: true, anon: false, n: 1 });
  });
});
