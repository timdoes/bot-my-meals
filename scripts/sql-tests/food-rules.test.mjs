// SQL tests for food rules, people without a login, and per-night attendees.
// Runs the real migration chain on an in-memory Postgres (PGlite). Synthetic data only:
// fake houses A and B, fake names, fake uuids. No network, no real household, no secrets.
//   npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migDir = path.join(here, "../../supabase/migrations");
const NEW_FILES = [
  "20261011220000_food_rules.sql",
  "20261011221000_week_night_attendees.sql",
  "20261011222000_food_rules_enforcement.sql",
];

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
const U = { aOwner: id(101), aVoter: id(102), aEater: id(103), bOwner: id(201), multi: id(301) };
const H = { a: id(1), b: id(2) };

let db;
let week; // { id, starts_on }
let sam, kidB, aOwnerM, store;

async function asUser(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
  }
}
const q = (sql, params) => db.query(sql, params).then((r) => r.rows);
async function fails(promise, re) {
  await assert.rejects(promise, (e) => (re ? re.test(String(e.message)) : true));
}

before(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  for (const f of fs.readdirSync(migDir).sort()) {
    const sql = fs.readFileSync(path.join(migDir, f), "utf8").replace(/create extension[^;]*;/gi, "");
    await db.exec(sql);
  }
  await db.exec(`
    insert into auth.users(id,email) values
      ('${U.aOwner}','a1@example.test'),('${U.aVoter}','a2@example.test'),('${U.aEater}','a3@example.test'),
      ('${U.bOwner}','b1@example.test'),('${U.multi}','m@example.test');
    insert into public.households(id,name) values ('${H.a}','House A'),('${H.b}','House B');
    insert into public.memberships(household_id,user_id,role,display_name,email) values
      ('${H.a}','${U.aOwner}','owner','Alex','a1@example.test'),
      ('${H.a}','${U.aVoter}','voter','Robin','a2@example.test'),
      ('${H.a}','${U.aEater}','eater','Eli','a3@example.test'),
      ('${H.b}','${U.bOwner}','owner','Bea','b1@example.test'),
      ('${H.a}','${U.multi}','voter','Mo','m@example.test'),
      ('${H.b}','${U.multi}','voter','Mo','m@example.test');
  `);
  [aOwnerM] = await q(`select id from public.memberships where user_id='${U.aOwner}'`);
  const [{ start }] = await q(`select to_char(private.week_start(0, private.house_local_date('America/Los_Angeles')),'YYYY-MM-DD') as start`);
  const wk = await q(`insert into public.weeks(household_id,starts_on,status,night_headcounts)
    values ('${H.a}','${start}','voting','{3,3,3,3,3,3,3}') returning id, to_char(starts_on,'YYYY-MM-DD') as starts_on`);
  week = wk[0];
  await q(`insert into public.weeks(household_id,starts_on,status,night_headcounts)
    values ('${H.b}','${start}','voting','{2,2,2,2,2,2,2}') returning id`);
  store = (await q(`insert into public.household_stores(household_id,name,slug) values ('${H.a}','Test Store','test-store') returning id`))[0];
  sam = (await q(`insert into public.household_eaters(household_id,display_name) values ('${H.a}','Sam') returning id`))[0];
  kidB = (await q(`insert into public.household_eaters(household_id,display_name) values ('${H.b}','Kit') returning id`))[0];
});

after(async () => db?.close());

const addMeal = (day, title, pitch = "") =>
  q(
    `insert into public.meals(household_id,week_id,day_index,night_date,title,pitch,audience,servings)
     values ($1,$2,$3,$4,$5,$6,'family',3) returning id`,
    [H.a, week.id, day, new Date(new Date(week.starts_on).getTime() + day * 86400000).toISOString().slice(0, 10), title, pitch],
  );

describe("migrations", () => {
  it("re-applying the three new files is a no-op", async () => {
    for (const f of NEW_FILES) {
      await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
    }
    const [{ n }] = await q(`select count(*)::int n from public.allergen_terms`);
    assert.ok(n > 150);
  });

  it("never calls the bot wake", () => {
    for (const f of NEW_FILES) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf8");
      assert.doesNotMatch(sql, /net\.http|pg_net|http_post|bot_wake|webhook/i, f);
    }
  });
});

describe("RLS and isolation", () => {
  it("Admin and User write, Eater and outsiders do not", async () => {
    await asUser(U.aOwner, () =>
      db.query(`insert into public.food_rules(household_id,subject_eater_id,food_label,severity,allergen_code)
        values ($1,$2,'Peanuts','allergy','peanuts')`, [H.a, sam.id]),
    );
    await asUser(U.aVoter, () =>
      db.query(`insert into public.food_rules(household_id,food_label,severity) values ($1,'Mushrooms','dislike')`, [H.a]),
    );
    await fails(
      asUser(U.aEater, () => db.query(`insert into public.food_rules(household_id,food_label,severity) values ($1,'Kale','dislike')`, [H.a])),
      /row-level security/,
    );
    await fails(
      asUser(U.bOwner, () => db.query(`insert into public.food_rules(household_id,food_label,severity) values ($1,'Kale','dislike')`, [H.a])),
      /row-level security/,
    );
    await fails(
      asUser(U.aEater, () => db.query(`insert into public.household_eaters(household_id,display_name) values ($1,'Zed')`, [H.a])),
      /row-level security/,
    );
  });

  it("Eater can read; other house sees nothing", async () => {
    const eater = await asUser(U.aEater, () => q(`select food_label from public.food_rules`));
    assert.equal(eater.length, 2);
    const other = await asUser(U.bOwner, async () => ({
      rules: await q(`select 1 from public.food_rules`),
      eaters: await q(`select 1 from public.household_eaters where household_id='${H.a}'`),
    }));
    assert.equal(other.rules.length, 0);
    assert.equal(other.eaters.length, 0);
  });

  it("composite FK stops a rule pointing at another house's person", async () => {
    await fails(
      db.query(`insert into public.food_rules(household_id,subject_eater_id,food_label,severity) values ($1,$2,'Eggs','allergy')`, [H.a, kidB.id]),
      /foreign key/,
    );
    await fails(
      db.query(`insert into public.food_rules(household_id,subject_membership_id,food_label,severity)
        select $1, id, 'Eggs','allergy' from public.memberships where household_id=$2 limit 1`, [H.a, H.b]),
      /foreign key/,
    );
  });

  it("a rule cannot move houses; duplicates and the 12-person cap hold", async () => {
    await fails(db.query(`update public.food_rules set household_id=$1 where food_label='Mushrooms'`, [H.b]));
    await fails(
      db.query(`insert into public.food_rules(household_id,subject_eater_id,food_label,severity) values ($1,$2,'peanuts','allergy')`, [H.a, sam.id]),
      /duplicate/,
    );
    await fails(db.query(`insert into public.household_eaters(household_id,display_name) values ($1,' sam ')`, [H.a]), /duplicate/);
    for (let i = 0; i < 11; i++) {
      await db.query(`insert into public.household_eaters(household_id,display_name) values ($1,$2)`, [H.b, `Kid${i}`]);
    }
    await fails(db.query(`insert into public.household_eaters(household_id,display_name) values ($1,'Extra')`, [H.b]), /up to 12/);
  });

  it("adding a named person creates no login, membership, invite or vote", async () => {
    const before = await q(`select (select count(*) from auth.users)::int u, (select count(*) from public.memberships)::int m,
      (select count(*) from public.household_invites)::int i, (select count(*) from public.votes)::int v`);
    await asUser(U.aVoter, () => db.query(`insert into public.household_eaters(household_id,display_name) values ($1,'Ivy')`, [H.a]));
    const after = await q(`select (select count(*) from auth.users)::int u, (select count(*) from public.memberships)::int m,
      (select count(*) from public.household_invites)::int i, (select count(*) from public.votes)::int v`);
    assert.deepEqual(after, before);
  });

  it("attendee and list tables have no direct write for signed-in users", async () => {
    await fails(
      asUser(U.aOwner, () => db.query(`insert into public.week_night_lists(household_id,week_id,day_index) values ($1,$2,1)`, [H.a, week.id])),
      /permission denied/,
    );
    await fails(asUser(U.aOwner, () => db.query(`delete from public.week_night_attendees`)), /permission denied/);
    await fails(asUser(U.aOwner, () => db.query(`insert into public.allergen_terms values ('milk','zzz')`)), /permission denied/);
  });
});

describe("per-night lists (save_week_people_v2)", () => {
  const counts = [3, 3, 3, 3, 3, 3, 3];

  it("named list: plates = people + guests, up and down", async () => {
    await asUser(U.aOwner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [
        week.id, counts,
        JSON.stringify([{ day_index: 2, membership_ids: [aOwnerM.id], eater_ids: [sam.id], guests: 1 }]),
      ]),
    );
    let [w] = await q(`select night_headcounts from public.weeks where id=$1`, [week.id]);
    const idx = (new Date(week.starts_on).getUTCDay() + 2) % 7;
    assert.equal(w.night_headcounts[idx], 3);
    await asUser(U.aOwner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [
        week.id, counts,
        JSON.stringify([{ day_index: 2, membership_ids: [aOwnerM.id], eater_ids: [], guests: 0 }]),
      ]),
    );
    [w] = await q(`select night_headcounts from public.weeks where id=$1`, [week.id]);
    assert.equal(w.night_headcounts[idx], 1, "plates fall to 1 person");
    const lists = await q(`select guests from public.week_night_lists where week_id=$1 and day_index=2`, [week.id]);
    assert.equal(lists[0].guests, 0);
  });

  it("an unchanged list wins over a stale count; Everyone leaves plates alone", async () => {
    const idx = (new Date(week.starts_on).getUTCDay() + 2) % 7;
    await asUser(U.aOwner, () => db.query(`select public.save_week_people_v2($1,$2,null,null)`, [week.id, [5, 5, 5, 5, 5, 5, 5]]));
    let [w] = await q(`select night_headcounts from public.weeks where id=$1`, [week.id]);
    assert.equal(w.night_headcounts[idx], 1);
    assert.equal(w.night_headcounts[(idx + 1) % 7], 5);
    await asUser(U.aOwner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, w.night_headcounts, JSON.stringify([{ day_index: 2, everyone: true }])]),
    );
    [w] = await q(`select night_headcounts from public.weeks where id=$1`, [week.id]);
    assert.equal(w.night_headcounts[idx], 1, "Everyone keeps plates where they were");
    assert.equal((await q(`select 1 from public.week_night_lists where week_id=$1`, [week.id])).length, 0);
  });

  it("rejects: eater role, empty list, other-house ids, other-house caller", async () => {
    const ok = [{ day_index: 3, membership_ids: [aOwnerM.id] }];
    await fails(asUser(U.aEater, () => db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, counts, JSON.stringify(ok)])), /Eaters can look/);
    await fails(
      asUser(U.aOwner, () => db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, counts, JSON.stringify([{ day_index: 3, membership_ids: [], eater_ids: [] }])])),
      /at least one person/,
    );
    await fails(
      asUser(U.aOwner, () => db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, counts, JSON.stringify([{ day_index: 3, eater_ids: [kidB.id] }])])),
      /not in this household/,
    );
    await fails(asUser(U.bOwner, () => db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, counts, JSON.stringify(ok)])), /Eaters can look/);
  });

  it("an Off night drops its list; a person who is a night's only attendee cannot be removed", async () => {
    const idx = (new Date(week.starts_on).getUTCDay() + 4) % 7;
    const c = [...counts];
    await asUser(U.aOwner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, c, JSON.stringify([{ day_index: 4, eater_ids: [sam.id], guests: 1 }])]),
    );
    await fails(db.query(`delete from public.household_eaters where id=$1`, [sam.id]), /last_attendee/);
    c[idx] = 0;
    await asUser(U.aOwner, () => db.query(`select public.save_week_people_v2($1,$2,null,null)`, [week.id, c]));
    assert.equal((await q(`select 1 from public.week_night_lists where week_id=$1 and day_index=4`, [week.id])).length, 0);
    assert.equal((await q(`select 1 from public.week_night_attendees where week_id=$1`, [week.id])).length, 0);
  });

  it("deleting a household is not blocked by the floor", async () => {
    const h = id(77);
    await db.exec(`insert into public.households(id,name) values ('${h}','Temp')`);
    const wk = (await q(`insert into public.weeks(household_id,starts_on,status) values ('${h}',current_date,'voting') returning id`))[0];
    const e = (await q(`insert into public.household_eaters(household_id,display_name) values ('${h}','Zoe') returning id`))[0];
    await db.exec(`insert into public.week_night_lists(household_id,week_id,day_index) values ('${h}','${wk.id}',0);
      insert into public.week_night_attendees(household_id,week_id,day_index,eater_id) values ('${h}','${wk.id}',0,'${e.id}')`);
    await db.exec(`delete from public.households where id='${h}'`);
    assert.equal((await q(`select 1 from public.household_eaters where id=$1`, [e.id])).length, 0);
  });
});

describe("matching, ballot reject, scope", () => {
  it("scope: Everyone nights use every person's rules; named lists only the listed + whole house", async () => {
    const day1 = await q(`select food_label from private.food_rules_for_night($1, 1::smallint)`, [week.id]);
    assert.deepEqual(day1.map((r) => r.food_label).sort(), ["Mushrooms", "Peanuts"]);
    await asUser(U.aOwner, () =>
      db.query(`select public.save_week_people_v2($1,$2,null,$3::jsonb)`, [week.id, [3, 3, 3, 3, 3, 3, 3], JSON.stringify([{ day_index: 1, membership_ids: [aOwnerM.id] }])]),
    );
    const named = await q(`select food_label from private.food_rules_for_night($1, 1::smallint)`, [week.id]);
    assert.deepEqual(named.map((r) => r.food_label), ["Mushrooms"], "Sam is not eating day 1");
  });

  it("ballot write: rejects an in-scope allergen, accepts when the person is not eating", async () => {
    await fails(addMeal(0, "Peanut noodles"), /food_rule_conflict: Peanuts/);
    await fails(addMeal(0, "Quiet pasta", "tossed with peanut sauce"), /food_rule_conflict: Peanuts/);
    await addMeal(1, "Peanut noodles"); // day 1: Sam is not on the list
    await fails(addMeal(2, "Creamy mushroom risotto"), /food_rule_conflict: Mushrooms/);
    await addMeal(3, "Lemon chicken");
  });

  it("an unchanged title does not re-check; a changed title does", async () => {
    await db.query(`update public.meals set servings=4 where week_id=$1 and day_index=1`, [week.id]);
    await fails(db.query(`update public.meals set title='Peanut stew' where week_id=$1 and day_index=3`, [week.id]), /food_rule_conflict/);
  });

  it("exclusions and plurals: peanut butter is not a milk hit; peanuts match a peanut rule", async () => {
    const [milk] = await q(`insert into public.food_rules(household_id,food_label,severity,allergen_code) values ($1,'Milk','allergy','milk') returning *`, [H.a]);
    const hit = (text) => q(`select private.rule_hit(r, $2) as t from public.food_rules r where r.id=$1`, [milk.id, text]).then((x) => x[0].t);
    assert.equal(await hit("Peanut butter toast"), null);
    assert.equal(await hit("Butternut squash soup"), null);
    assert.ok(await hit("Mac and cheese"));
    assert.ok(await hit("Grilled cheeses"));
    assert.equal(await hit("Coconut milk curry"), null);
    await db.exec(`delete from public.food_rules where id='${milk.id}'`);
    const [pn] = await q(`select id from public.food_rules where food_label='Peanuts'`);
    const pnHit = (t) => q(`select private.rule_hit(r, $2) as t from public.food_rules r where r.id=$1`, [pn.id, t]).then((x) => x[0].t);
    assert.ok(await pnHit("Peanut noodles"));
    assert.ok(await pnHit("Thai peanuts and rice"));
    assert.equal(await pnHit("Butternut squash"), null);
    assert.equal(await pnHit("Walnut brownies"), null, "peanut rule does not match tree nuts");
  });
});

describe("held recipes", () => {
  it("allergen ingredient holds the recipe; ack by User ok, Eater not; cleared when rule removed", async () => {
    await db.exec(`insert into public.food_rules(household_id,food_label,severity,allergen_code) values ('${H.a}','Soy','allergy','soy')`);
    const [{ id: mid }] = await q(`select id from public.meals where week_id=$1 and day_index=3`, [week.id]);
    const [rec] = await q(`insert into public.recipes(household_id,meal_id,servings) values ($1,$2,3) returning id`, [H.a, mid]);
    await db.query(`insert into public.recipe_ingredients(household_id,recipe_id,name,quantity,unit,store_id) values ($1,$2,'Soy sauce',2,'tbsp',$3)`, [H.a, rec.id, store.id]);
    const holds = await q(`select id, matched_term from public.recipe_food_holds where recipe_id=$1`, [rec.id]);
    assert.equal(holds.length, 1);
    await fails(asUser(U.aEater, () => db.query(`select public.ack_recipe_food_hold($1)`, [holds[0].id])), /Eaters can look/);
    await fails(asUser(U.bOwner, () => db.query(`select public.ack_recipe_food_hold($1)`, [holds[0].id])), /Eaters can look/);
    await asUser(U.aVoter, () => db.query(`select public.ack_recipe_food_hold($1)`, [holds[0].id]));
    const [ack] = await q(`select acknowledged_by, acknowledged_at from public.recipe_food_holds where id=$1`, [holds[0].id]);
    assert.ok(ack.acknowledged_at);
    assert.equal(ack.acknowledged_by, U.aVoter);
    const visible = await asUser(U.bOwner, () => q(`select 1 from public.recipe_food_holds`));
    assert.equal(visible.length, 0, "other house sees no holds");
    await db.exec(`delete from public.food_rules where food_label='Soy'`);
    assert.equal((await q(`select 1 from public.recipe_food_holds where recipe_id=$1`, [rec.id])).length, 0);
  });

  it("intolerance and dislike never hold", async () => {
    await db.exec(`insert into public.food_rules(household_id,food_label,severity,allergen_code) values ('${H.a}','Soy','intolerance','soy')`);
    assert.equal((await q(`select 1 from public.recipe_food_holds`)).length, 0);
    await db.exec(`delete from public.food_rules where food_label='Soy'`);
  });
});

describe("food_rules_for_bot", () => {
  it("single house: names, rules, nights; no emails or user ids", async () => {
    const out = await asUser(U.aOwner, () => q(`select public.food_rules_for_bot() as j`)).then((r) => r[0].j);
    assert.equal(out.household_id, H.a);
    assert.equal(out.reviewed, true);
    assert.ok(out.people.some((p) => p.name === "Sam" && p.kind === "named"));
    assert.ok(out.rules.some((r) => r.food === "Peanuts" && r.who === "Sam" && r.kind === "allergy"));
    const text = JSON.stringify(out);
    assert.doesNotMatch(text, /example\.test/);
    for (const uid of Object.values(U)) assert.ok(!text.includes(uid), "no user id");
    const n1 = out.nights.find((n) => n.day_index === 1);
    assert.equal(n1.attendees_custom, true);
    assert.deepEqual(n1.attendees, ["Alex"]);
    assert.equal(n1.guests, 0);
    assert.deepEqual(n1.rules.map((r) => r.food), ["Mushrooms"]);
    const n0 = out.nights.find((n) => n.day_index === 0);
    assert.equal(n0.attendees_custom, false);
    assert.ok(n0.rules.some((r) => r.food === "Peanuts"));
  });

  it("multi-house login must name the house; wrong house is refused; no leak", async () => {
    await fails(asUser(U.multi, () => q(`select public.food_rules_for_bot()`)), /household_required/);
    await fails(asUser(U.multi, () => q(`select public.food_rules_for_bot($1)`, [id(999)])), /not_a_member/);
    await fails(asUser(U.aOwner, () => q(`select public.food_rules_for_bot($1)`, [H.b])), /not_a_member/);
    const b = await asUser(U.multi, () => q(`select public.food_rules_for_bot($1) as j`, [H.b])).then((r) => r[0].j);
    assert.equal(b.household_id, H.b);
    assert.doesNotMatch(JSON.stringify(b), /Peanuts|Sam|Alex/);
    await fails(asUser(U.multi, () => q(`select public.food_rules_for_bot($1,$2)`, [H.b, week.id])), /not in this household/);
  });

  it("a house with nothing set reads reviewed=false", async () => {
    const out = await asUser(U.bOwner, () => q(`select public.food_rules_for_bot() as j`)).then((r) => r[0].j);
    assert.equal(out.reviewed, false);
    assert.deepEqual(out.rules, []);
  });

  it("bot token write path: meals insert as a member is checked by the trigger", async () => {
    await fails(
      asUser(U.aVoter, () =>
        db.query(`insert into public.meals(household_id,week_id,day_index,night_date,title,pitch,audience,servings)
          values ($1,$2,5,$3,'Peanut chicken','','family',3)`, [H.a, week.id, week.starts_on]),
      ),
      /food_rule_conflict|duplicate/,
    );
  });
});

describe("set_food_rules_reviewed", () => {
  it("owner and voter set it; eater and other house are rejected; anon_exec=0", async () => {
    await db.exec(`update public.households set food_rules_reviewed_at=null where id='${H.a}'`);
    await asUser(U.aOwner, () => db.query(`select public.set_food_rules_reviewed($1)`, [H.a]));
    const [afterOwner] = await q(`select food_rules_reviewed_at is not null as ok from public.households where id=$1`, [H.a]);
    assert.equal(afterOwner.ok, true);

    await db.exec(`update public.households set food_rules_reviewed_at=null where id='${H.a}'`);
    await asUser(U.aVoter, () => db.query(`select public.set_food_rules_reviewed($1)`, [H.a]));
    const [afterVoter] = await q(`select food_rules_reviewed_at is not null as ok from public.households where id=$1`, [H.a]);
    assert.equal(afterVoter.ok, true);

    await fails(asUser(U.aEater, () => db.query(`select public.set_food_rules_reviewed($1)`, [H.a])), /Eaters can look/);
    await fails(asUser(U.bOwner, () => db.query(`select public.set_food_rules_reviewed($1)`, [H.a])), /not_a_member/);

    const [anon] = await q(
      `select has_function_privilege('anon','public.set_food_rules_reviewed(uuid)','EXECUTE')::int as anon_exec`,
    );
    assert.equal(anon.anon_exec, 0);
  });
});
