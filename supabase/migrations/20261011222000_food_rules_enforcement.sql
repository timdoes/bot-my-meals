-- Food rules, part 3 of 3: matching, ballot-write reject, held recipes, and the bot read.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.
-- Requires 20261011220000_food_rules.sql and 20261011221000_week_night_attendees.sql.
--
-- Nothing here wakes the bot. Rules and attendees are read live by food_rules_for_bot().
-- Every lookup is scoped by the household_id of the row being written or read; no function
-- here guesses a household from "the earliest membership".
-- lock_week is NOT changed here (separate file, ships with the UI).

-- ---------------------------------------------------------------------------
-- Matching (conservative keyword net; not a guarantee of safety)
-- ---------------------------------------------------------------------------

create or replace function private.text_has_term(p_norm text, p_term text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  t text := private.norm_text(p_term);   -- ' word word '
  base text := rtrim(t);                 -- ' word word'
  trimmed text := btrim(t);
begin
  if trimmed = '' then
    return false;
  end if;
  if position(t in p_norm) > 0
     or position(base || 's ' in p_norm) > 0
     or position(base || 'es ' in p_norm) > 0 then
    return true;
  end if;
  -- plural term, singular text ("peanuts" rule, "peanut" in the recipe)
  if char_length(trimmed) > 3 and right(trimmed, 1) = 's'
     and position(left(base, -1) || ' ' in p_norm) > 0 then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function private.text_has_term(text, text) from public, anon;
grant execute on function private.text_has_term(text, text) to authenticated;

-- Returns the matched word, or null. Exclusion phrases ("peanut butter" is not milk) are removed
-- first for allergen-coded rules. Free-text rules match their own words only.
create or replace function private.rule_hit(r public.food_rules, p_text text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  norm text := private.norm_text(p_text);
  ex record;
  term text;
begin
  if r.allergen_code is not null then
    for ex in
      select phrase from public.allergen_exclusions where allergen_code = r.allergen_code
    loop
      norm := replace(norm, private.norm_text(ex.phrase), ' ');
    end loop;
  end if;

  if private.text_has_term(norm, r.food_key) then
    return r.food_key;
  end if;

  if r.allergen_code is not null then
    for term in
      select t.term from public.allergen_terms t where t.allergen_code = r.allergen_code
    loop
      if private.text_has_term(norm, term) then
        return term;
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function private.rule_hit(public.food_rules, text) from public, anon;
grant execute on function private.rule_hit(public.food_rules, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ballot-write reject: title + pitch for Allergy, title only for Intolerance and Dislike.
-- Only rules in scope for THIS night (whole house + the people eating that night).
-- ---------------------------------------------------------------------------

create or replace function private.reject_food_rule_meal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.food_rules%rowtype;
  hit text;
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.pitch is not distinct from old.pitch
     and new.week_id is not distinct from old.week_id
     and new.day_index is not distinct from old.day_index then
    return new;
  end if;

  if not exists (select 1 from public.food_rules fr where fr.household_id = new.household_id) then
    return new;
  end if;

  for r in
    select * from private.food_rules_for_night(new.week_id, new.day_index)
    where household_id = new.household_id
  loop
    if r.severity = 'allergy' then
      hit := private.rule_hit(r, coalesce(new.title, '') || ' ' || coalesce(new.pitch, ''));
    else
      hit := private.rule_hit(r, coalesce(new.title, ''));
    end if;
    if hit is not null then
      raise exception 'food_rule_conflict: %', r.food_label
        using detail = r.severity || ' / ' || hit,
              hint = 'Write this dinner without ' || r.food_label || '.';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.reject_food_rule_meal() from public, anon;

drop trigger if exists meals_reject_food_rule on public.meals;
create trigger meals_reject_food_rule
  before insert or update of title, pitch, week_id, day_index on public.meals
  for each row execute function private.reject_food_rule_meal();

-- ---------------------------------------------------------------------------
-- Held recipes (after lock, ingredients known). Allergy only.
-- ---------------------------------------------------------------------------

create unique index if not exists recipes_household_id_id_key
  on public.recipes (household_id, id);

create table if not exists public.recipe_food_holds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  recipe_id uuid not null,
  rule_id uuid not null,
  matched_term text not null,
  created_at timestamptz not null default now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  foreign key (household_id, recipe_id)
    references public.recipes (household_id, id) on delete cascade,
  foreign key (household_id, rule_id)
    references public.food_rules (household_id, id) on delete cascade,
  unique (recipe_id, rule_id)
);

alter table public.recipe_food_holds enable row level security;

drop policy if exists recipe_food_holds_member_read on public.recipe_food_holds;
create policy recipe_food_holds_member_read on public.recipe_food_holds
  for select to authenticated
  using (public.is_household_member(household_id));

revoke all on public.recipe_food_holds from anon, authenticated, public;
grant select on public.recipe_food_holds to authenticated;
grant all on public.recipe_food_holds to service_role;

create or replace function private.refresh_food_holds_for_recipe(p_recipe uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.recipes%rowtype;
  m public.meals%rowtype;
  wk public.weeks%rowtype;
  cooking public.weeks%rowtype;
  r public.food_rules%rowtype;
  hit text;
  keep uuid[] := '{}';
begin
  select * into rec from public.recipes where id = p_recipe;
  if rec.id is null then
    return;
  end if;

  select * into m from public.meals where id = rec.meal_id;
  select * into wk from public.weeks where id = m.week_id;
  select * into cooking from private.open_cooking_week(rec.household_id);

  -- past weeks are never held
  if m.id is not null and cooking.id is not null and wk.starts_on >= cooking.starts_on then
    for r in
      select * from private.food_rules_for_night(m.week_id, m.day_index)
      where household_id = rec.household_id and severity = 'allergy'
    loop
      hit := private.rule_hit(r, m.title);
      if hit is null then
        select private.rule_hit(r, i.name) into hit
        from public.recipe_ingredients i
        where i.recipe_id = rec.id and private.rule_hit(r, i.name) is not null
        limit 1;
      end if;
      if hit is not null then
        insert into public.recipe_food_holds (household_id, recipe_id, rule_id, matched_term)
        values (rec.household_id, rec.id, r.id, hit)
        on conflict (recipe_id, rule_id) do update set matched_term = excluded.matched_term;
        keep := keep || r.id;
      end if;
    end loop;
  end if;

  delete from public.recipe_food_holds
  where recipe_id = rec.id and not (rule_id = any (keep));
end;
$$;

revoke all on function private.refresh_food_holds_for_recipe(uuid) from public, anon;

create or replace function private.refresh_food_holds(p_household uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
begin
  for rid in select id from public.recipes where household_id = p_household loop
    perform private.refresh_food_holds_for_recipe(rid);
  end loop;
end;
$$;

revoke all on function private.refresh_food_holds(uuid) from public, anon;

create or replace function private.food_holds_on_ingredient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.refresh_food_holds_for_recipe(
    case when tg_op = 'DELETE' then old.recipe_id else new.recipe_id end
  );
  return null;
end;
$$;

revoke all on function private.food_holds_on_ingredient() from public, anon;

drop trigger if exists recipe_ingredients_food_holds on public.recipe_ingredients;
create trigger recipe_ingredients_food_holds
  after insert or update or delete on public.recipe_ingredients
  for each row execute function private.food_holds_on_ingredient();

create or replace function private.food_holds_on_recipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.refresh_food_holds_for_recipe(new.id);
  return null;
end;
$$;

revoke all on function private.food_holds_on_recipe() from public, anon;

drop trigger if exists recipes_food_holds on public.recipes;
create trigger recipes_food_holds
  after insert or update of meal_id on public.recipes
  for each row execute function private.food_holds_on_recipe();

create or replace function private.food_holds_on_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.refresh_food_holds(new.household_id);
  return null;
end;
$$;

revoke all on function private.food_holds_on_rule() from public, anon;

drop trigger if exists food_rules_food_holds on public.food_rules;
create trigger food_rules_food_holds
  after insert or update on public.food_rules
  for each row execute function private.food_holds_on_rule();

-- "I've checked": logged, reveals the recipe in the app. Admin or User of that household only.
create or replace function public.ack_recipe_food_hold(p_hold uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  h public.recipe_food_holds%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into h from public.recipe_food_holds where id = p_hold;
  if h.id is null then
    raise exception 'That hold is not in your household.';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.household_id = h.household_id
      and m.user_id = uid
      and m.role in ('owner', 'voter')
  ) then
    raise exception 'Eaters can look, not change food rules.';
  end if;

  update public.recipe_food_holds
  set acknowledged_by = uid, acknowledged_at = now()
  where id = h.id and acknowledged_at is null;
end;
$$;

revoke all on function public.ack_recipe_food_hold(uuid) from public, anon;
grant execute on function public.ack_recipe_food_hold(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'recipe_food_holds'
     ) then
    alter publication supabase_realtime add table public.recipe_food_holds;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The bot read. Security INVOKER: Row Level Security scopes it to the caller's households.
-- p_household_id is optional. With none, a caller in exactly one household gets it; a caller in
-- several must pass one (never guessed). A passed id must be a household the caller belongs to.
-- No emails, no user ids in the output.
-- ---------------------------------------------------------------------------

create or replace function public.food_rules_for_bot(
  p_household_id uuid default null,
  p_week_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  n integer;
  tz text;
  today date;
  reviewed boolean;
  people jsonb;
  people_count integer;
  rules jsonb;
  nights jsonb := '[]'::jsonb;
  w record;
  i integer;
  dow integer;
  plates integer;
  custom boolean;
  names jsonb;
  listed integer;
  night_rules jsonb;
  guests integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_household_id is not null then
    if not exists (
      select 1 from public.memberships m
      where m.user_id = uid and m.household_id = p_household_id
    ) then
      raise exception 'not_a_member';
    end if;
    hid := p_household_id;
  else
    select count(*) into n from public.memberships m where m.user_id = uid;
    if n = 0 then
      return jsonb_build_object(
        'household_id', null, 'reviewed', false,
        'people', '[]'::jsonb, 'rules', '[]'::jsonb, 'nights', '[]'::jsonb
      );
    end if;
    if n > 1 then
      raise exception 'household_required';
    end if;
    select m.household_id into hid from public.memberships m where m.user_id = uid;
  end if;

  select h.timezone, h.food_rules_reviewed_at is not null
    into tz, reviewed
  from public.households h where h.id = hid;
  today := (now() at time zone coalesce(tz, 'America/Los_Angeles'))::date;

  if p_week_id is not null and not exists (
    select 1 from public.weeks wk where wk.id = p_week_id and wk.household_id = hid
  ) then
    raise exception 'That week is not in this household.';
  end if;

  select coalesce(jsonb_agg(p.obj order by p.sort, p.name), '[]'::jsonb), count(*)
    into people, people_count
  from (
    select m.display_name as name, 0 as sort,
           jsonb_build_object('name', m.display_name, 'kind', 'member') as obj
    from public.memberships m where m.household_id = hid
    union all
    select e.display_name, 1,
           jsonb_build_object('name', e.display_name, 'kind', 'named')
    from public.household_eaters e where e.household_id = hid
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
      'food', r.food_label,
      'kind', r.severity,
      'who', coalesce(
        (select m.display_name from public.memberships m
          where m.id = r.subject_membership_id and m.household_id = r.household_id),
        (select e.display_name from public.household_eaters e
          where e.id = r.subject_eater_id and e.household_id = r.household_id),
        'Whole house'),
      'allergen_code', r.allergen_code,
      'details', r.details,
      'match_terms', (
        select coalesce(jsonb_agg(distinct t.term), '[]'::jsonb)
        from public.allergen_terms t where t.allergen_code = r.allergen_code
      ) || to_jsonb(r.food_key)
    ) order by
      case r.severity when 'allergy' then 0 when 'intolerance' then 1 else 2 end,
      r.food_label), '[]'::jsonb)
    into rules
  from public.food_rules r where r.household_id = hid;

  reviewed := reviewed or exists (
    select 1 from public.food_rules r where r.household_id = hid
  );

  for w in
    select wk.id, wk.starts_on, wk.night_headcounts as wc, h.night_headcounts as hc
    from public.weeks wk
    join public.households h on h.id = wk.household_id
    where wk.household_id = hid
      and (
        (p_week_id is not null and wk.id = p_week_id)
        or (p_week_id is null and wk.starts_on + 6 >= today)
      )
    order by wk.starts_on
  loop
    for i in 0..6 loop
      dow := extract(dow from w.starts_on + i)::int;
      plates := coalesce(
        case when w.wc is not null and cardinality(w.wc) = 7 then w.wc[dow + 1] end,
        case when w.hc is not null and cardinality(w.hc) = 7 then w.hc[dow + 1] end,
        0);
      continue when plates <= 0;

      select l.guests, true into guests, custom
      from public.week_night_lists l
      where l.week_id = w.id and l.day_index = i;
      custom := coalesce(custom, false);

      if custom then
        select coalesce(jsonb_agg(x.name order by x.name), '[]'::jsonb), count(*)
          into names, listed
        from (
          select m.display_name as name
          from public.week_night_attendees a
          join public.memberships m on m.id = a.membership_id and m.household_id = a.household_id
          where a.week_id = w.id and a.day_index = i
          union all
          select e.display_name
          from public.week_night_attendees a
          join public.household_eaters e on e.id = a.eater_id and e.household_id = a.household_id
          where a.week_id = w.id and a.day_index = i
        ) x;
      else
        select coalesce(jsonb_agg(p ->> 'name' order by p ->> 'name'), '[]'::jsonb)
          into names
        from jsonb_array_elements(people) p;
        listed := people_count;
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
          'food', r.food_label,
          'kind', r.severity,
          'who', coalesce(
            (select m.display_name from public.memberships m
              where m.id = r.subject_membership_id and m.household_id = r.household_id),
            (select e.display_name from public.household_eaters e
              where e.id = r.subject_eater_id and e.household_id = r.household_id),
            'Whole house'),
          'allergen_code', r.allergen_code
        ) order by
          case r.severity when 'allergy' then 0 when 'intolerance' then 1 else 2 end,
          r.food_label), '[]'::jsonb)
        into night_rules
      from private.food_rules_for_night(w.id, i::smallint) r
      where r.household_id = hid;

      nights := nights || jsonb_build_array(jsonb_build_object(
        'week_id', w.id,
        'day_index', i,
        'date', w.starts_on + i,
        'plates', plates,
        'attendees_custom', custom,
        'attendees', names,
        'guests', case when custom then guests else null end,
        'unnamed_plates', case when custom then guests else greatest(plates - listed, 0) end,
        'rules', night_rules
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'household_id', hid,
    'reviewed', reviewed,
    'people', people,
    'rules', rules,
    'nights', nights
  );
end;
$$;

revoke all on function public.food_rules_for_bot(uuid, uuid) from public, anon;
grant execute on function public.food_rules_for_bot(uuid, uuid) to authenticated;

comment on function public.food_rules_for_bot(uuid, uuid) is
  'Food rules, people, and per-night attendees for the bot. Security invoker: RLS scopes it to the caller. Optional household id is validated against membership; a caller in several households must pass one. No emails or user ids. Does not wake the bot.';
