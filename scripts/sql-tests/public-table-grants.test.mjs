// SQL tests: explicit public table grants after the Oct 30, 2026 default-privilege
// change. Fresh PGlite with Data API default privileges REVOKED first, then every
// migration. Synthetic data only. `npm run test:sql`
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const REASSERT = "20261021120000_reassert_public_table_grants.sql";
const VERIFY = path.join(here, "../../supabase/verify_public_table_grants.sql");
const VERIFY_EXEC = path.join(here, "../../supabase/verify_public_execute.sql");

const POST_OCT30_STUBS = `
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
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
`;

const AUTH_SIDU = [
  "profiles",
  "households",
  "memberships",
  "household_stores",
  "weeks",
  "meals",
  "votes",
  "recipes",
  "recipe_ingredients",
  "shopping_lists",
  "shopping_items",
  "household_invites",
  "household_join_tokens",
  "ballot_requests",
  "saved_meals",
  "meal_dislikes",
  "household_eaters",
  "food_rules",
];
const AUTH_SELECT = [
  "meal_history_weeks",
  "meal_history_nights",
  "allergen_terms",
  "allergen_exclusions",
  "week_night_lists",
  "week_night_attendees",
  "recipe_food_holds",
];
const AUTH_SELECT_INSERT = ["meal_likes"];
const ALL_TABLES = [...AUTH_SIDU, ...AUTH_SELECT, ...AUTH_SELECT_INSERT];
const DML = ["select", "insert", "update", "delete"];

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = { aOwner: id(101), bOwner: id(201) };
const H = { a: id(1), b: id(2) };

async function applyMigrations(db) {
  for (const f of fs.readdirSync(migDir).sort()) {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
}

async function freshDb() {
  const db = new PGlite();
  await db.exec(POST_OCT30_STUBS);
  await applyMigrations(db);
  return db;
}

function priv(db, role, table, privilege) {
  return db
    .query(`select has_table_privilege($1, $2::regclass, $3) as ok`, [role, `public.${table}`, privilege])
    .then((r) => r.rows[0].ok);
}

function expectedAuth(table, privilege) {
  if (AUTH_SIDU.includes(table)) return true;
  if (AUTH_SELECT.includes(table)) return privilege === "select";
  if (AUTH_SELECT_INSERT.includes(table)) return privilege === "select" || privilege === "insert";
  return false;
}

describe("public table grants after Oct 30 default revoke", () => {
  it("authenticated and service_role have the intended DML; anon has none", async () => {
    const db = await freshDb();

    for (const table of ALL_TABLES) {
      for (const privilege of DML) {
        assert.equal(
          await priv(db, "authenticated", table, privilege),
          expectedAuth(table, privilege),
          `${table} authenticated ${privilege}`,
        );
        assert.equal(await priv(db, "anon", table, privilege), false, `${table} anon ${privilege}`);
        assert.equal(await priv(db, "service_role", table, privilege), true, `${table} service_role ${privilege}`);
      }
    }

    const views = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'`,
    );
    assert.equal(views.rows.length, 0);

    const seqs = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'S'`,
    );
    assert.equal(seqs.rows.length, 0);

    const listed = await db.query(`
      select table_name, privilege_type, grantee
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated', 'service_role')
        and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    `);
    assert.equal(
      listed.rows.filter((r) => r.grantee === "anon").length,
      0,
      "anon must not appear in role_table_grants",
    );
    for (const table of ALL_TABLES) {
      for (const privilege of DML) {
        const row = listed.rows.find(
          (r) => r.table_name === table && r.privilege_type === privilege.toUpperCase() && r.grantee === "authenticated",
        );
        assert.equal(Boolean(row), expectedAuth(table, privilege), `${table} role_table_grants authenticated ${privilege}`);
      }
    }

    const verify = await db.query(fs.readFileSync(VERIFY, "utf8"));
    assert.equal(Number(verify.rows[0].missing_auth), 0);
    assert.equal(Number(verify.rows[0].missing_service), 0);
    assert.equal(Number(verify.rows[0].extra_anon), 0);
    assert.equal(Number(verify.rows[0].public_relations), ALL_TABLES.length);

    const exec = await db.query(fs.readFileSync(VERIFY_EXEC, "utf8"));
    assert.equal(Number(exec.rows[0].anon_exec), 0);
    assert.equal(Number(exec.rows[0].public_exec), 0);

    await db.close();
  });

  it("re-assert migration is a no-op on grants already applied", async () => {
    const db = await freshDb();
    const before = await db.query(fs.readFileSync(VERIFY, "utf8"));
    await db.exec(fs.readFileSync(path.join(migDir, REASSERT), "utf8"));
    const after = await db.query(fs.readFileSync(VERIFY, "utf8"));
    assert.deepEqual(after.rows[0], before.rows[0]);
    await db.close();
  });

  it("authenticated household user can read a week and check a list item; house B and anon cannot", async () => {
    const db = await freshDb();
    const weekA = id(11);
    const weekB = id(21);
    const listA = id(12);
    const itemA = id(13);
    const storeA = id(14);
    const storeB = id(24);
    const listB = id(22);
    const itemB = id(23);

    await db.exec(`
      insert into auth.users(id,email) values ('${U.aOwner}','a@example.test'),('${U.bOwner}','b@example.test');
      insert into public.households(id,name) values ('${H.a}','House A'),('${H.b}','House B');
      insert into public.memberships(household_id,user_id,role,display_name,email) values
        ('${H.a}','${U.aOwner}','owner','Alex','a@example.test'),
        ('${H.b}','${U.bOwner}','owner','Bea','b@example.test');
      insert into public.weeks(id,household_id,starts_on,status) values
        ('${weekA}','${H.a}','2026-10-18','locked'),
        ('${weekB}','${H.b}','2026-10-18','locked');
      insert into public.household_stores(id,household_id,name,slug) values
        ('${storeA}','${H.a}','Market','market'),
        ('${storeB}','${H.b}','Market','market');
      insert into public.shopping_lists(id,household_id,week_id) values
        ('${listA}','${H.a}','${weekA}'),
        ('${listB}','${H.b}','${weekB}');
      insert into public.shopping_items(id,household_id,shopping_list_id,store_id,name,quantity,unit,checked) values
        ('${itemA}','${H.a}','${listA}','${storeA}','Milk',1,'ct',false),
        ('${itemB}','${H.b}','${listB}','${storeB}','Milk',1,'ct',false);
    `);

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${U.aOwner}',false);`);
    const weeks = await db.query(`select id from public.weeks where household_id = '${H.a}'`);
    assert.equal(weeks.rows.length, 1);
    await db.exec(`update public.shopping_items set checked = true where id = '${itemA}'`);
    const checked = await db.query(`select checked from public.shopping_items where id = '${itemA}'`);
    assert.equal(checked.rows[0].checked, true);

    const otherWeek = await db.query(`select id from public.weeks where household_id = '${H.b}'`);
    assert.equal(otherWeek.rows.length, 0);
    await db.exec(`update public.shopping_items set checked = true where id = '${itemB}'`);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
    const otherItem = await db.query(`select checked from public.shopping_items where id = '${itemB}'`);
    assert.equal(otherItem.rows[0].checked, false);

    await db.exec(`set role anon`);
    await assert.rejects(
      db.query(`select id from public.weeks`),
      (e) => /permission denied/i.test(String(e.message)),
    );
    await assert.rejects(
      db.query(`update public.shopping_items set checked = true where id = '${itemA}'`),
      (e) => /permission denied/i.test(String(e.message)),
    );
    await db.exec(`reset role`);
    await db.close();
  });
});
