// SQL tests: setup_step 7 -> 8 steps (expand + remap), lock_week food-rules gate, set_night_guests.
// In-memory Postgres (PGlite), synthetic data only. `npm run test:sql`
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const REMAP = "20261011224500_setup_step_nine_remap.sql";

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

async function freshDb({ skipRemap = false } = {}) {
  const db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    if (skipRemap && f === REMAP) continue;
    await db.exec(fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
  }
  return db;
}
const rows = (db, sql, params) => db.query(sql, params).then((r) => r.rows);
async function asUser(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  }
}

describe("setup_step: expand then remap", () => {
  it("expand widens to 9, defaults to done, and request_week_ballot writes 9", async () => {
    const db = await freshDb({ skipRemap: true });
    const [{ def }] = await rows(db, `select pg_get_constraintdef(oid) as def from pg_constraint where conname='households_setup_step_check'`);
    assert.match(def, /<= 9/);
    await db.exec(`insert into public.households(id,name) values ('${id(1)}','Default')`);
    assert.equal((await rows(db, `select setup_step from public.households where id='${id(1)}'`))[0].setup_step, 9);
    await assert.rejects(db.exec(`update public.households set setup_step=10 where id='${id(1)}'`));
    const [{ src }] = await rows(db, `select pg_get_functiondef('public.request_week_ballot(date)'::regprocedure) as src`);
    assert.match(src, /setup_step = 9/);
    assert.doesNotMatch(src, /setup_step = 8/);
    await db.close();
  });

  it("remap shifts 5..8 up by one, leaves 1-4 and 9 alone, and a second run is a no-op", async () => {
    const db = await freshDb({ skipRemap: true });
    for (const [i, st] of [1, 2, 3, 4, 5, 6, 7, 8, 9].entries()) {
      await db.exec(`insert into public.households(id,name,setup_step) values ('${id(100 + i)}','H${st}',${st})`);
    }
    const remap = fs.readFileSync(path.join(migDir, REMAP), "utf8");
    await db.exec(remap);
    const map = Object.fromEntries((await rows(db, `select name, setup_step from public.households`)).map((r) => [r.name, r.setup_step]));
    assert.deepEqual([map.H1, map.H2, map.H3, map.H4, map.H5, map.H6, map.H7, map.H8, map.H9], [1, 2, 3, 4, 6, 7, 8, 9, 9]);
    await db.exec(remap); // a dashboard re-run
    const again = Object.fromEntries((await rows(db, `select name, setup_step from public.households`)).map((r) => [r.name, r.setup_step]));
    assert.deepEqual(again, map, "second run changes nothing");
    assert.equal((await rows(db, `select 1 from private.migration_markers where key='setup_step_nine_remap'`)).length, 1);
    await db.close();
  });

  it("the marker table is not readable by signed-in users", async () => {
    const db = await freshDb();
    await assert.rejects(asUser(db, id(5), () => db.query(`select * from private.migration_markers`)), /permission denied/);
    await db.close();
  });
});

describe("lock_week food-rules gate and set_night_guests", () => {
  const H = id(1);
  const U = { owner: id(11), eater: id(12) };
  async function house() {
    const db = await freshDb();
    await db.exec(`
      insert into auth.users(id,email) values ('${U.owner}','o@example.test'),('${U.eater}','e@example.test');
      insert into public.households(id,name) values ('${H}','House A');
      insert into public.memberships(household_id,user_id,role,display_name) values
        ('${H}','${U.owner}','owner','Alex'),('${H}','${U.eater}','eater','Eli');
      insert into public.household_stores(household_id,name,slug) values ('${H}','Test Store','test-store');
    `);
    const [{ start }] = await rows(db, `select to_char(private.week_start(0, private.house_local_date('America/Los_Angeles')),'YYYY-MM-DD') as start`);
    const [week] = await rows(db, `insert into public.weeks(household_id,starts_on,status,night_headcounts) values ($1,$2,'voting','{2,2,2,2,2,2,2}') returning id`, [H, start]);
    const [sam] = await rows(db, `insert into public.household_eaters(household_id,display_name) values ($1,'Sam') returning id`, [H]);
    const [alex] = await rows(db, `select id from public.memberships where user_id=$1`, [U.owner]);
    for (const d of [0, 1]) {
      await db.query(`insert into public.meals(household_id,week_id,day_index,night_date,title,pitch,audience,servings)
        values ($1,$2,$3,$4::date,'Lemon chicken','','couple',2)`, [H, week.id, d, new Date(Date.parse(start + "T00:00:00Z") + d * 86400000).toISOString().slice(0, 10)]);
    }
    return { db, week, sam, alex, start };
  }

  it("blocks locking on an in-scope allergy; a list that excludes the person unblocks", async () => {
    const { db, week, sam, alex } = await house();
    await db.exec(`insert into public.food_rules(household_id,subject_eater_id,food_label,severity) values ('${H}','${sam.id}','Chicken','allergy')`);
    await assert.rejects(asUser(db, U.owner, () => db.query(`select public.lock_week($1)`, [week.id])), /food_rule_needs_change: Chicken/);
    assert.equal((await rows(db, `select status from public.weeks where id=$1`, [week.id]))[0].status, "voting");
    await asUser(db, U.owner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [
        week.id, [2, 2, 2, 2, 2, 2, 2],
        JSON.stringify([
          { day_index: 0, membership_ids: [alex.id], guests: 1 },
          { day_index: 1, membership_ids: [alex.id], guests: 1 },
        ]),
      ]),
    );
    await asUser(db, U.owner, () => db.query(`select public.lock_week($1)`, [week.id]));
    assert.equal((await rows(db, `select status from public.weeks where id=$1`, [week.id]))[0].status, "locked");
    await db.close();
  });

  it("an intolerance never blocks a lock; removing the allergy unblocks", async () => {
    const { db, week } = await house();
    await db.exec(`insert into public.food_rules(household_id,food_label,severity) values ('${H}','Lemon','intolerance')`);
    await asUser(db, U.owner, () => db.query(`select public.lock_week($1)`, [week.id])); // intolerance alone: locks
    await db.exec(`update public.weeks set status='voting'`);
    await db.exec(`insert into public.food_rules(household_id,food_label,severity) values ('${H}','Chicken','allergy')`);
    await assert.rejects(asUser(db, U.owner, () => db.query(`select public.lock_week($1)`, [week.id])), /food_rule_needs_change/);
    await db.exec(`delete from public.food_rules where severity='allergy'`);
    await asUser(db, U.owner, () => db.query(`select public.lock_week($1)`, [week.id]));
    await db.close();
  });

  it("set_night_guests: changes guests and plates on a named list; Everyone, Eater, negative refused", async () => {
    const { db, week, sam, alex, start } = await house();
    await asUser(db, U.owner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [
        week.id, [2, 2, 2, 2, 2, 2, 2],
        JSON.stringify([{ day_index: 0, membership_ids: [alex.id], eater_ids: [sam.id], guests: 0 }]),
      ]),
    );
    const idx = new Date(start + "T00:00:00Z").getUTCDay();
    await asUser(db, U.owner, () => db.query(`select public.set_night_guests($1,0::smallint,2)`, [week.id]));
    const [w] = await rows(db, `select night_headcounts from public.weeks where id=$1`, [week.id]);
    assert.equal(w.night_headcounts[idx], 4, "2 people + 2 guests");
    assert.equal((await rows(db, `select servings from public.meals where week_id=$1 and day_index=0`, [week.id]))[0].servings, 4);
    assert.equal((await rows(db, `select count(*)::int n from public.week_night_attendees where week_id=$1 and day_index=0`, [week.id]))[0].n, 2);
    await assert.rejects(asUser(db, U.owner, () => db.query(`select public.set_night_guests($1,3::smallint,1)`, [week.id])), /no named list/);
    await assert.rejects(asUser(db, U.eater, () => db.query(`select public.set_night_guests($1,0::smallint,1)`, [week.id])), /Eaters can look/);
    await assert.rejects(asUser(db, U.owner, () => db.query(`select public.set_night_guests($1,0::smallint,-1)`, [week.id])), /below zero/);
    await db.close();
  });
});
