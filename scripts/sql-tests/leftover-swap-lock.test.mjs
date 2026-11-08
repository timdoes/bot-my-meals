// SQL tests: leftover swap / dinner request on a past night must not block lock.
// Remaining nights still block. In-memory Postgres (PGlite). `npm run test:sql`
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

describe("enforce_week_lock remaining nights", () => {
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
    const [mem] = await rows(db, `select id from public.memberships where user_id=$1`, [U]);
    return { week, today, start, mem };
  }

  it("lets lock_week succeed when the only open swap is on a past night", async () => {
    const db = await freshDb();
    const { week, mem } = await house(db);
    await db.query(
      `insert into public.votes(household_id,meal_id,membership_id,choice,note)
       values ($1,$2,$3,'swap','too heavy')`,
      [H, id(40), mem.id],
    );
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [locked] = await rows(db, `select status from public.weeks where id=$1`, [week.id]);
    assert.equal(locked.status, "locked");
    const [still] = await rows(db, `select choice from public.votes where meal_id=$1`, [id(40)]);
    assert.equal(still.choice, "swap");
    await db.close();
  });

  it("lets lock_week succeed when the only dinner request is on a past night", async () => {
    const db = await freshDb();
    const { week, mem } = await house(db);
    await db.query(
      `insert into public.votes(household_id,meal_id,membership_id,choice)
       values ($1,$2,$3,'request_new_meal')`,
      [H, id(40), mem.id],
    );
    await asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id]));
    const [locked] = await rows(db, `select status from public.weeks where id=$1`, [week.id]);
    assert.equal(locked.status, "locked");
    await db.close();
  });

  it("still refuses lock when a remaining night has a swap", async () => {
    const db = await freshDb();
    const { week, today, start, mem } = await house(db);
    const todayIndex = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000,
    );
    await db.query(
      `insert into public.votes(household_id,meal_id,membership_id,choice,note)
       values ($1,$2,$3,'swap','too heavy')`,
      [H, id(40 + todayIndex), mem.id],
    );
    await assert.rejects(
      () => asUser(db, U, () => db.query(`select public.lock_week($1)`, [week.id])),
      /Week cannot lock while a swap or new-meal request is open/,
    );
    const [row] = await rows(db, `select status from public.weeks where id=$1`, [week.id]);
    assert.equal(row.status, "voting");
    await db.close();
  });

  it("counts remaining nights in pg_get_functiondef (matches checkWeekLock todayIso)", async () => {
    const db = await freshDb();
    const [{ src }] = await rows(
      db,
      `select pg_get_functiondef('private.enforce_week_lock()'::regprocedure) as src`,
    );
    assert.match(src, /m\.night_date >= today/);
    assert.match(src, /private\.house_local_date/);
    await db.close();
  });
});
