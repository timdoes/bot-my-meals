-- First-lock coverage: nights before weeks.planned_from were never locked.
-- Nullable, no backfill. Existing locked weeks with null stay fully covered.
-- Unlock + re-lock must not move planned_from (coalesce on first lock only).
-- No new public tables. Re-assert weeks / meal_history_weeks Data API grants
-- (no anon). New and replaced functions revoke EXECUTE from public and anon.

alter table public.weeks
  add column if not exists planned_from date;

comment on column public.weeks.planned_from is
  'House-local date of the first lock. Nights before this were never covered. Null until the first lock; a null on an already-locked week means the whole week is covered.';

alter table public.meal_history_weeks
  add column if not exists planned_from date;

comment on column public.meal_history_weeks.planned_from is
  'Copy of weeks.planned_from at archive time. Null means the archived week was fully covered.';

grant select, insert, update, delete on public.weeks to authenticated;
grant select on public.meal_history_weeks to authenticated;
grant all on public.weeks to service_role;
grant all on public.meal_history_weeks to service_role;

create or replace function private.week_lock_covers_night(planned_from date, night_date date)
returns boolean
language sql
immutable
as $$
  select planned_from is null or night_date >= planned_from;
$$;

revoke all on function private.week_lock_covers_night(date, date) from public, anon;

create or replace function private.week_shopping_lines(target_week uuid)
returns table (
  store_id uuid,
  name text,
  quantity numeric,
  unit text,
  name_key text,
  unit_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ri.store_id,
    min(ri.name) as name,
    round(sum(ri.quantity), 2) as quantity,
    min(ri.unit) as unit,
    private.shopping_name_key(ri.name) as name_key,
    private.shopping_unit_key(ri.unit) as unit_key
  from public.meals m
  join public.weeks w on w.id = m.week_id
  join public.recipes r on r.meal_id = m.id
  join public.recipe_ingredients ri on ri.recipe_id = r.id
  where m.week_id = target_week
    and not private.night_is_off(m.id)
    and private.week_lock_covers_night(w.planned_from, m.night_date)
  group by ri.store_id, private.shopping_name_key(ri.name), private.shopping_unit_key(ri.unit);
$$;

revoke all on function private.week_shopping_lines(uuid) from public, anon;

create or replace function public.lock_week(target_week uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  tz text;
  today date;
  cooking public.weeks%rowtype;
  target public.weeks%rowtype;
  lid uuid;
  fr public.food_rules%rowtype;
  mm public.meals%rowtype;
  hit text;
begin
  select household_id into hid
  from public.memberships
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if hid is null then
    raise exception 'Not in a household';
  end if;

  select timezone into tz
  from public.households
  where id = hid;

  today := private.house_local_date(tz);

  select * into target
  from public.weeks
  where id = target_week
    and household_id = hid;

  if target.id is null then
    raise exception 'That week is not in this household.';
  end if;

  select * into cooking from private.open_cooking_week(hid);
  if cooking.id is null
    or (
      target.starts_on is distinct from cooking.starts_on
      and target.starts_on is distinct from cooking.starts_on + 7
    ) then
    raise exception 'Only this week and next week can be locked.';
  end if;

  for mm in
    select * from public.meals m
    where m.week_id = target.id
      and m.household_id = hid
      and btrim(m.title) <> ''
      and not private.night_is_off(m.id)
      and m.night_date >= today
    order by m.day_index
  loop
    for fr in
      select * from private.food_rules_for_night(mm.week_id, mm.day_index)
      where household_id = hid and severity = 'allergy'
    loop
      hit := private.rule_hit(fr, coalesce(mm.title, '') || ' ' || coalesce(mm.pitch, ''));
      if hit is not null then
        raise exception 'food_rule_needs_change: % on night %', fr.food_label, mm.day_index
          using detail = 'Swap this dinner or remove the allergy before locking.',
                hint = mm.title;
      end if;
    end loop;
  end loop;

  update public.weeks
  set status = 'locked',
      planned_from = coalesce(planned_from, today)
  where id = target.id;

  delete from public.shopping_lists where week_id = target.id;

  insert into public.shopping_lists (household_id, week_id)
  values (hid, target.id)
  returning id into lid;

  insert into public.shopping_items (
    household_id, shopping_list_id, store_id, name, quantity, unit
  )
  select hid, lid, lines.store_id, lines.name, lines.quantity, lines.unit
  from private.week_shopping_lines(target.id) lines;

  return lid;
end;
$$;

revoke all on function public.lock_week(uuid) from public, anon;
grant execute on function public.lock_week(uuid) to authenticated;

create or replace function public.meal_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  tz text;
  today date;
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id, h.timezone
    into hid, tz
  from public.memberships m
  join public.households h on h.id = m.household_id
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null then
    return '[]'::jsonb;
  end if;

  today := private.house_local_date(tz);

  delete from public.meal_history_weeks hw
  where hw.household_id = hid
    and exists (
      select 1
      from public.weeks w
      where w.household_id = hid
        and w.starts_on = hw.starts_on
        and w.status is distinct from 'locked'
    );

  delete from public.meal_history_weeks hw
  where hw.household_id = hid
    and private.week_saturday(hw.starts_on) >= today;

  insert into public.meal_history_weeks (household_id, source_week_id, starts_on, planned_from)
  select w.household_id, w.id, w.starts_on, w.planned_from
  from public.weeks w
  where w.household_id = hid
    and w.status = 'locked'
    and private.week_saturday(w.starts_on) < today
  on conflict (household_id, starts_on)
  do update set
    source_week_id = excluded.source_week_id,
    planned_from = excluded.planned_from;

  delete from public.meal_history_nights n
  using public.meal_history_weeks hw
  join public.weeks w
    on w.household_id = hw.household_id
   and w.starts_on = hw.starts_on
  where n.history_week_id = hw.id
    and hw.household_id = hid
    and w.status = 'locked'
    and private.week_saturday(w.starts_on) < today
    and exists (select 1 from public.meals m where m.week_id = w.id);

  insert into public.meal_history_nights (
    household_id,
    history_week_id,
    night_date,
    title,
    plates
  )
  select distinct on (hw.id, m.night_date)
    m.household_id,
    hw.id,
    m.night_date,
    btrim(m.title),
    m.servings
  from public.meals m
  join public.weeks w on w.id = m.week_id
  join public.meal_history_weeks hw
    on hw.household_id = w.household_id
   and hw.starts_on = w.starts_on
  where w.household_id = hid
    and w.status = 'locked'
    and private.week_saturday(w.starts_on) < today
    and btrim(m.title) <> ''
    and private.week_lock_covers_night(w.planned_from, m.night_date)
    and not exists (
      select 1
      from (
        select v.choice
        from public.votes v
        join public.memberships mem on mem.id = v.membership_id
        where v.meal_id = m.id
          and mem.household_id = hid
          and mem.role in ('owner', 'voter')
          and v.choice in ('swap', 'remove', 'request_new_meal')
        order by v.updated_at desc, v.id desc
        limit 1
      ) latest
      where latest.choice = 'remove'
    )
  order by hw.id, m.night_date, m.day_index
  on conflict (history_week_id, night_date)
  do update set title = excluded.title, plates = excluded.plates;

  delete from public.meal_history_weeks
  where household_id = hid
    and id in (
      select id
      from public.meal_history_weeks
      where household_id = hid
      order by starts_on desc
      offset 26
    );

  select coalesce(jsonb_agg(item order by item->>'startsOn' desc), '[]'::jsonb)
    into result
  from (
    select jsonb_build_object(
      'startsOn', to_char(hw.starts_on, 'YYYY-MM-DD'),
      'nights', coalesce(
        (
          select jsonb_agg(night order by night->>'nightDate')
          from (
            select jsonb_build_object(
              'nightDate', to_char(d::date, 'YYYY-MM-DD'),
              'title', '',
              'plates', null,
              'notPlanned', true
            ) as night
            from generate_series(
              hw.starts_on,
              hw.planned_from - 1,
              interval '1 day'
            ) as d
            where hw.planned_from is not null
              and hw.planned_from > hw.starts_on
            union all
            select jsonb_build_object(
              'nightDate', to_char(n.night_date, 'YYYY-MM-DD'),
              'title', n.title,
              'plates', n.plates
            ) as night
            from public.meal_history_nights n
            where n.history_week_id = hw.id
          ) listed_nights
        ),
        '[]'::jsonb
      )
    ) as item
    from public.meal_history_weeks hw
    where hw.household_id = hid
    order by hw.starts_on desc
    limit 26
  ) listed;

  return result;
end;
$$;

revoke all on function public.meal_history() from public, anon;
grant execute on function public.meal_history() to authenticated;
