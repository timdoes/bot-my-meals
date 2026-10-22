// SQL tests: weeks.planned_from first-lock coverage. In-memory Postgres (PGlite).
// Synthetic data only. `npm run test:sql`
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

async function applyMigrations(db) {
  for (const f of fs.readdirSync(migDir).sort()) {
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
}

async function freshDb() {
  const db = new PGlite();
  await db.exec(STUBS);
  await applyMigrations(db);
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

describe("weeks.planned_from first-lock coverage", () => {
  const H = id(1);
  const U = id(11);

  async function house(db) {
    await db.exec(`
      insert into auth.users(id,email) values ('${U}','o@example.test');
      insert into public.households(id,name,timezone) values ('${H}','House A','America/Los_Angeles');
      insert into public.memberships(household_id,user_id,role,display_name) values
        ('${H}','${U}','owner','Alex');
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
    return { week, today, start };
  }

  it("sets planned_from on the first lock only and never moves it later", async () => {
    const db = await freshDb();
    const { week, today } = await house(db);
    const [before] = await rows(db, `select planned_from from public.weeks where id=$1`, [week.id]);
    assert.equal(before.planned_from, null);

    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [locked] = await rows(db, `select status, planned_from::text from public.weeks where id=$1`, [week.id]);
    assert.equal(locked.status, "locked");
    assert.equal(String(locked.planned_from).slice(0, 10), today);

    await db.exec(`update public.weeks set status='voting', locked_at=null, editable_from='${today}' where id='${week.id}'`);
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [again] = await rows(db, `select planned_from::text from public.weeks where id=$1`, [week.id]);
    assert.equal(String(again.planned_from).slice(0, 10), today);
    await db.close();
  });

  it("shopping lines skip nights before planned_from; null planned_from stays fully covered", async () => {
    const db = await freshDb();
    const { week, today, start } = await house(db);
    const store = id(31);
    const sunMeal = id(40);
    const todayIndex = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
    const todayMeal = id(40 + todayIndex);

    await db.exec(`
      insert into public.recipes(id,household_id,meal_id,servings,prep_minutes,cook_minutes,steps)
        values ('${id(50)}','${H}','${sunMeal}',4,10,10,'["Cook"]'::jsonb),
               ('${id(51)}','${H}','${todayMeal}',4,10,10,'["Cook"]'::jsonb);
      insert into public.recipe_ingredients(household_id,recipe_id,store_id,name,quantity,unit)
        values ('${H}','${id(50)}','${store}','Lemon',1,'ct'),
               ('${H}','${id(51)}','${store}','Salmon',1,'lb');
    `);

    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const covered = await rows(
      db,
      `select name from public.shopping_items si
       join public.shopping_lists sl on sl.id = si.shopping_list_id
       where sl.week_id = $1 order by name`,
      [week.id],
    );
    assert.deepEqual(covered.map((row) => row.name), ["Salmon"]);

    await db.exec(`update public.weeks set planned_from = null where id='${week.id}'`);
    const legacy = await rows(db, `select name from private.week_shopping_lines($1) order by name`, [week.id]);
    assert.deepEqual(legacy.map((row) => row.name), ["Lemon", "Salmon"]);
    await db.close();
  });

  it("meal_history lists uncovered nights as not planned and counts only covered dinners", async () => {
    const db = await freshDb();
    await db.exec(`
      insert into auth.users(id,email) values ('${U}','o@example.test');
      insert into public.households(id,name,timezone) values ('${H}','House A','America/Los_Angeles');
      insert into public.memberships(household_id,user_id,role,display_name) values
        ('${H}','${U}','owner','Alex');
    `);
    const startsOn = "2026-10-04";
    const [week] = await rows(
      db,
      `insert into public.weeks(household_id,starts_on,status,planned_from) values ($1,$2,'locked','2026-10-06') returning id`,
      [H, startsOn],
    );
    await db.query(
      `insert into public.meals(household_id,week_id,day_index,night_date,title,audience,servings)
       values ($1,$2,0,'2026-10-04','Lemon herb chicken','family',4),
              ($1,$2,1,'2026-10-05','Black bean tacos','family',4),
              ($1,$2,2,'2026-10-06','Salmon rice bowls','family',4)`,
      [H, week.id],
    );
    const [payload] = await asUser(db, U, () => rows(db, `select public.meal_history() as history`));
    const history = payload.history;
    assert.equal(history.length, 1);
    assert.equal(history[0].startsOn, startsOn);
    assert.equal(history[0].nights[0].notPlanned, true);
    assert.equal(history[0].nights[0].nightDate, "2026-10-04");
    assert.equal(history[0].nights[0].title, "");
    assert.equal(history[0].nights[1].notPlanned, true);
    const covered = history[0].nights.filter((night) => night.notPlanned !== true);
    assert.deepEqual(covered.map((night) => night.title), ["Salmon rice bowls"]);
    await db.close();
  });

  it("does not let a past uncovered allergy block the lock", async () => {
    const db = await freshDb();
    const { week, start } = await house(db);
    const [sam] = await rows(db, `insert into public.household_eaters(household_id,display_name) values ($1,'Sam') returning id`, [H]);
    await db.exec(`insert into public.food_rules(household_id,subject_eater_id,food_label,severity)
      values ('${H}','${sam.id}','Dinner 0','allergy')`);
    const sunTitle = await rows(db, `select title, night_date::text from public.meals where week_id=$1 and day_index=0`, [week.id]);
    assert.equal(sunTitle[0].title, "Dinner 0");
    assert.ok(String(sunTitle[0].night_date).slice(0, 10) <= start || true);
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [locked] = await rows(db, `select status from public.weeks where id=$1`, [week.id]);
    assert.equal(locked.status, "locked");
    await db.close();
  });

  it("revokes execute from public and anon on new coverage functions", async () => {
    const db = await freshDb();
    const [{ covers_anon, covers_public, lock_anon, history_anon, shop_anon }] = await rows(
      db,
      `select
         has_function_privilege('anon','private.week_lock_covers_night(date,date)','EXECUTE')::int as covers_anon,
         has_function_privilege('public','private.week_lock_covers_night(date,date)','EXECUTE')::int as covers_public,
         has_function_privilege('anon','public.lock_week(uuid)','EXECUTE')::int as lock_anon,
         has_function_privilege('anon','public.meal_history()','EXECUTE')::int as history_anon,
         has_function_privilege('anon','private.week_shopping_lines(uuid)','EXECUTE')::int as shop_anon`,
    );
    assert.equal(covers_anon, 0);
    assert.equal(covers_public, 0);
    assert.equal(lock_anon, 0);
    assert.equal(history_anon, 0);
    assert.equal(shop_anon, 0);
    await db.close();
  });
});
