// SQL tests: unlock_week is one transaction (status + delete list);
// rebuild_week_shopping_list refuses unless the week is locked.
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
  await db.exec(`
    create or replace function private.house_local_date(tz text)
    returns date
    language sql
    stable
    as $$ select date '2026-10-14' $$;
  `);
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

describe("unlock_week atomic + rebuild locked-only", () => {
  const H = id(1);
  const U = id(11);
  const V = id(12);

  async function house(db) {
    await db.exec(`
      insert into auth.users(id,email) values ('${U}','o@example.test'), ('${V}','v@example.test');
      insert into public.households(id,name,timezone) values ('${H}','House A','America/Los_Angeles');
      insert into public.memberships(household_id,user_id,role,display_name) values
        ('${H}','${U}','owner','Alex'),
        ('${H}','${V}','voter','Sam');
      insert into public.household_stores(id,household_id,name,slug) values
        ('${id(31)}','${H}','Market','market');
    `);
    const [{ today, start }] = await rows(
      db,
      `select to_char(private.house_local_date('America/Los_Angeles'),'YYYY-MM-DD') as today,
              to_char(private.week_start(0, private.house_local_date('America/Los_Angeles')),'YYYY-MM-DD') as start`,
    );
    const [week] = await rows(
      db,
      `insert into public.weeks(household_id,starts_on,status) values ($1,$2,'voting') returning id`,
      [H, start],
    );
    for (let d = 0; d < 7; d += 1) {
      const night = new Date(Date.parse(`${start}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
      await db.query(
        `insert into public.meals(id,household_id,week_id,day_index,night_date,title,pitch,audience,servings)
         values ($1,$2,$3,$4,$5::date,$6,'','family',4)`,
        [id(40 + d), H, week.id, d, night, `Dinner ${d}`],
      );
    }
    return { week, today };
  }

  it("unlock_week sets voting and deletes the shopping list in one function", async () => {
    const db = await freshDb();
    const { week, today } = await house(db);
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [before] = await rows(
      db,
      `select status, (select count(*)::int from public.shopping_lists where week_id=$1) as lists from public.weeks where id=$1`,
      [week.id],
    );
    assert.equal(before.status, "locked");
    assert.equal(before.lists, 1);

    await asUser(db, U, () => db.query(`select public.unlock_week($1, $2::date)`, [week.id, today]));
    const [after] = await rows(
      db,
      `select status, locked_at, editable_from::text as editable_from,
              (select count(*)::int from public.shopping_lists where week_id=$1) as lists
       from public.weeks where id=$1`,
      [week.id],
    );
    assert.equal(after.status, "voting");
    assert.equal(after.locked_at, null);
    assert.equal(String(after.editable_from).slice(0, 10), today);
    assert.equal(after.lists, 0);
    await db.close();
  });

  it("unlock_week deletes a leftover list even when the week is already voting", async () => {
    const db = await freshDb();
    const { week, today } = await house(db);
    await db.query(`insert into public.shopping_lists(household_id,week_id) values ($1,$2)`, [H, week.id]);
    await asUser(db, U, () => db.query(`select public.unlock_week($1, $2::date)`, [week.id, today]));
    const [after] = await rows(
      db,
      `select status, (select count(*)::int from public.shopping_lists where week_id=$1) as lists from public.weeks where id=$1`,
      [week.id],
    );
    assert.equal(after.status, "voting");
    assert.equal(after.lists, 0);
    await db.close();
  });

  it("rebuild_week_shopping_list no-ops on a voting week even if a leftover list exists", async () => {
    const db = await freshDb();
    const { week } = await house(db);
    const [list] = await rows(
      db,
      `insert into public.shopping_lists(household_id,week_id) values ($1,$2) returning id`,
      [H, week.id],
    );
    await db.query(
      `insert into public.shopping_items(household_id,shopping_list_id,store_id,name,quantity,unit,checked)
       values ($1,$2,$3,'Milk',1,'qt',true)`,
      [H, list.id, id(31)],
    );
    await asUser(db, U, () => db.query(`select public.rebuild_week_shopping_list($1)`, [week.id]));
    const items = await rows(
      db,
      `select name, quantity::text, checked from public.shopping_items where shopping_list_id=$1`,
      [list.id],
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "Milk");
    assert.equal(items[0].checked, true);
    await db.close();
  });

  it("refuses unlock from a non-admin", async () => {
    const db = await freshDb();
    const { week, today } = await house(db);
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    await assert.rejects(
      () => asUser(db, V, () => db.query(`select public.unlock_week($1, $2::date)`, [week.id, today])),
      /Only an Admin can unlock the week/,
    );
    const [row] = await rows(db, `select status from public.weeks where id=$1`, [week.id]);
    assert.equal(row.status, "locked");
    await db.close();
  });

  it("pg_get_functiondef locks the week row and returns unless locked", async () => {
    const db = await freshDb();
    const [{ unlockSrc }] = await rows(
      db,
      `select pg_get_functiondef('public.unlock_week(uuid, date)'::regprocedure) as "unlockSrc"`,
    );
    const [{ rebuildSrc }] = await rows(
      db,
      `select pg_get_functiondef('public.rebuild_week_shopping_list(uuid)'::regprocedure) as "rebuildSrc"`,
    );
    assert.match(unlockSrc, /for update/i);
    assert.match(unlockSrc, /delete from public\.shopping_lists/i);
    assert.match(unlockSrc, /status = 'voting'/);
    assert.match(rebuildSrc, /for update/i);
    assert.match(rebuildSrc, /week_status is distinct from 'locked'/);
    await db.close();
  });
});
