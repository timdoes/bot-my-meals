-- Meal history: title-only nights for finished weeks.
-- A week is finished when it is locked AND its Saturday is in the past
-- in the household timezone (the next calendar day has started).
-- Unlocked weeks are not archived. The live This week row is unchanged.
-- Stored per night: week start, night date, meal title, plates.
-- No recipe body, ingredients, steps, images, or shopping lines.

create or replace function private.week_saturday(starts_on date)
returns date
language sql
immutable
as $$
  select starts_on + ((6 - extract(dow from starts_on)::int + 7) % 7);
$$;

create or replace function private.house_local_date(tz text)
returns date
language plpgsql
stable
as $$
begin
  return (timezone(coalesce(nullif(btrim(tz), ''), 'America/Los_Angeles'), now()))::date;
exception
  when invalid_parameter_value then
    return (timezone('America/Los_Angeles', now()))::date;
end;
$$;

revoke all on function private.week_saturday(date) from public;
revoke all on function private.house_local_date(text) from public;

create table public.meal_history_weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  source_week_id uuid references public.weeks (id) on delete set null,
  starts_on date not null,
  unique (household_id, starts_on)
);

create table public.meal_history_nights (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  history_week_id uuid not null references public.meal_history_weeks (id) on delete cascade,
  night_date date not null,
  title text not null,
  plates integer,
  unique (history_week_id, night_date),
  check (char_length(btrim(title)) > 0),
  check (plates is null or plates >= 0)
);

create index meal_history_weeks_household_starts_idx
  on public.meal_history_weeks (household_id, starts_on desc);

create index meal_history_nights_week_idx
  on public.meal_history_nights (history_week_id, night_date);

comment on table public.meal_history_weeks is
  'Finished weeks (locked and Saturday past in the house timezone). Titles only.';

comment on table public.meal_history_nights is
  'One dinner title per night. No recipe, ingredients, steps, or shopping lines.';

alter table public.meal_history_weeks enable row level security;
alter table public.meal_history_nights enable row level security;

create policy meal_history_weeks_read on public.meal_history_weeks
  for select to authenticated
  using (public.is_household_member(household_id));

create policy meal_history_nights_read on public.meal_history_nights
  for select to authenticated
  using (public.is_household_member(household_id));

revoke all on public.meal_history_weeks from public, anon, authenticated;
revoke all on public.meal_history_nights from public, anon, authenticated;
grant select on public.meal_history_weeks to authenticated;
grant select on public.meal_history_nights to authenticated;
grant all on public.meal_history_weeks to service_role;
grant all on public.meal_history_nights to service_role;

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

  insert into public.meal_history_weeks (household_id, source_week_id, starts_on)
  select w.household_id, w.id, w.starts_on
  from public.weeks w
  where w.household_id = hid
    and w.status = 'locked'
    and private.week_saturday(w.starts_on) < today
  on conflict (household_id, starts_on)
  do update set source_week_id = excluded.source_week_id;

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
          select jsonb_agg(
            jsonb_build_object(
              'nightDate', to_char(n.night_date, 'YYYY-MM-DD'),
              'title', n.title,
              'plates', n.plates
            )
            order by n.night_date
          )
          from public.meal_history_nights n
          where n.history_week_id = hw.id
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

revoke all on function public.meal_history() from public;
grant execute on function public.meal_history() to authenticated;
