-- Food rules, part 2 of 3: who is eating each night.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.
-- Requires 20261011220000_food_rules.sql.
--
-- A night with NO list row = Everyone (every member and every named person, live; plates are the
-- free stepper exactly as today). A night WITH a list row (week_night_lists) is a named-list night:
-- exactly the people in week_night_attendees, plus `guests` unnamed plates. On a named-list night
-- plates = people + guests (the list wins). Existing weeks have no list rows: nothing changes.
-- Writes go only through the *_v2 RPCs. Old save_week_people / save_planning_people are untouched.
-- Nothing here wakes the bot.

create table if not exists public.week_night_lists (
  household_id uuid not null,
  week_id uuid not null,
  day_index smallint not null check (day_index between 0 and 6),
  guests smallint not null default 0 check (guests between 0 and 12),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (week_id, day_index),
  foreign key (household_id, week_id)
    references public.weeks (household_id, id) on delete cascade
);

alter table public.week_night_lists enable row level security;

drop policy if exists week_night_lists_member_read on public.week_night_lists;
create policy week_night_lists_member_read on public.week_night_lists
  for select to authenticated
  using (public.is_household_member(household_id));

revoke all on public.week_night_lists from anon, authenticated, public;
grant select on public.week_night_lists to authenticated;

create table if not exists public.week_night_attendees (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  week_id uuid not null,
  day_index smallint not null check (day_index between 0 and 6),
  membership_id uuid,
  eater_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(membership_id, eater_id) = 1),
  foreign key (week_id, day_index)
    references public.week_night_lists (week_id, day_index) on delete cascade,
  foreign key (household_id, week_id)
    references public.weeks (household_id, id) on delete cascade,
  foreign key (household_id, membership_id)
    references public.memberships (household_id, id) on delete cascade,
  foreign key (household_id, eater_id)
    references public.household_eaters (household_id, id) on delete cascade
);

create unique index if not exists week_night_attendees_member_key
  on public.week_night_attendees (week_id, day_index, membership_id)
  where membership_id is not null;
create unique index if not exists week_night_attendees_eater_key
  on public.week_night_attendees (week_id, day_index, eater_id)
  where eater_id is not null;
create index if not exists week_night_attendees_week_idx
  on public.week_night_attendees (week_id, day_index);

alter table public.week_night_attendees enable row level security;

drop policy if exists week_night_attendees_member_read on public.week_night_attendees;
create policy week_night_attendees_member_read on public.week_night_attendees
  for select to authenticated
  using (public.is_household_member(household_id));

-- Writes only through the RPCs below (security definer). No direct write grants.
revoke all on public.week_night_attendees from anon, authenticated, public;
grant select on public.week_night_attendees to authenticated;

-- A cascade or manual write can never move a row between households.
create or replace function private.week_night_attendees_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Attendee rows are replaced, not edited.';
  end if;
  return new;
end;
$$;

revoke all on function private.week_night_attendees_guard() from public, anon;

drop trigger if exists week_night_attendees_guard on public.week_night_attendees;
create trigger week_night_attendees_guard
  before update on public.week_night_attendees
  for each row execute function private.week_night_attendees_guard();

-- Turning a night off (plates 0) drops that night's attendees, even when an older app did it.
create or replace function private.clear_attendees_for_off_nights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
  dow integer;
begin
  if new.night_headcounts is null or cardinality(new.night_headcounts) <> 7 then
    return new;
  end if;
  for i in 0..6 loop
    dow := extract(dow from new.starts_on + i)::int;
    if new.night_headcounts[dow + 1] = 0 then
      delete from public.week_night_lists
      where week_id = new.id and day_index = i;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.clear_attendees_for_off_nights() from public, anon;

drop trigger if exists weeks_clear_attendees_off_nights on public.weeks;
create trigger weeks_clear_attendees_off_nights
  after update of night_headcounts on public.weeks
  for each row execute function private.clear_attendees_for_off_nights();

-- Rules that apply to one night: whole-house rules, plus rules whose person is eating.
-- No attendee rows for the night = every person's rules apply. Security invoker: RLS scopes it.
create or replace function private.food_rules_for_night(p_week uuid, p_day smallint)
returns setof public.food_rules
language sql
stable
set search_path = public
as $$
  select r.*
  from public.food_rules r
  join public.weeks w on w.id = p_week and w.household_id = r.household_id
  where (
    (r.subject_membership_id is null and r.subject_eater_id is null)
    or not exists (
      select 1 from public.week_night_attendees a
      where a.week_id = p_week and a.day_index = p_day
    )
    or exists (
      select 1 from public.week_night_attendees a
      where a.week_id = p_week
        and a.day_index = p_day
        and a.household_id = r.household_id
        and (
          (a.membership_id is not null and a.membership_id = r.subject_membership_id)
          or (a.eater_id is not null and a.eater_id = r.subject_eater_id)
        )
    )
  );
$$;

revoke all on function private.food_rules_for_night(uuid, smallint) from public, anon;
grant execute on function private.food_rules_for_night(uuid, smallint) to authenticated;

-- Floor of one: a named person (or member) who is the ONLY attendee of a current or future named-list
-- night cannot be removed, because the night would silently fall back to Everyone.
create or replace function private.block_last_attendee_removal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  col text := case tg_table_name when 'household_eaters' then 'eater_id' else 'membership_id' end;
  hit boolean;
begin
  -- a household being deleted cascades everything; do not block that
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  execute format(
    'select exists (
       select 1 from public.week_night_attendees a
       join public.weeks w on w.id = a.week_id
       where a.%I = $1
         and w.starts_on + 6 >= current_date - 1
         and not exists (
           select 1 from public.week_night_attendees b
           where b.week_id = a.week_id and b.day_index = a.day_index and b.id <> a.id
         )
     )', col)
  into hit using old.id;

  if hit then
    raise exception 'last_attendee: this person is the only one listed for a night. Add someone else to that night first.';
  end if;
  return old;
end;
$$;

revoke all on function private.block_last_attendee_removal() from public, anon;

drop trigger if exists household_eaters_block_last_attendee on public.household_eaters;
create trigger household_eaters_block_last_attendee
  before delete on public.household_eaters
  for each row execute function private.block_last_attendee_removal();

drop trigger if exists memberships_block_last_attendee on public.memberships;
create trigger memberships_block_last_attendee
  before delete on public.memberships
  for each row execute function private.block_last_attendee_removal();

-- Save plates AND who is eating. p_attendees is a jsonb array, one element per night to change:
--   {"day_index": 2, "everyone": true}                                   -> Everyone (plates stay as counts says)
--   {"day_index": 2, "membership_ids": [...], "eater_ids": [...], "guests": 1}
--                                                                        -> named list; plates = people + guests
-- null p_attendees = leave lists as they are. A night that already has a list and is not in
-- p_attendees keeps plates = its people + guests (the list wins) unless counts sets it to 0 (Off,
-- which drops the list). Needs at least one person on a list (floor 1). Plates can go down as well
-- as up on a named-list night. Calls the existing save_week_people for the plate work, so
-- locked-week and editable-from rules still apply. Does not wake the bot.
create or replace function public.save_week_people_v2(
  target_week uuid,
  counts integer[],
  instructions text default null,
  p_attendees jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wk public.weeks%rowtype;
  member_role text;
  effective integer[];
  item jsonb;
  d integer;
  dow integer;
  n_members integer;
  n_eaters integer;
  listed integer;
  g integer;
  everyone boolean;
  result uuid;
  planned jsonb := '[]'::jsonb;
  touched integer[] := '{}';
  lst record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into wk from public.weeks where id = target_week;
  if wk.id is null then
    raise exception 'That week is not in this household.';
  end if;

  select m.role into member_role
  from public.memberships m
  where m.user_id = uid and m.household_id = wk.household_id;

  if member_role is null or member_role not in ('owner', 'voter') then
    raise exception 'Eaters can look, not change nights.';
  end if;

  if counts is null or cardinality(counts) <> 7 then
    raise exception 'Set at least one dinner night (plates above zero).';
  end if;

  effective := counts;

  if p_attendees is not null then
    if jsonb_typeof(p_attendees) <> 'array' then
      raise exception 'Attendees must be a list of nights.';
    end if;

    for item in select * from jsonb_array_elements(p_attendees) loop
      d := (item ->> 'day_index')::int;
      if d is null or d < 0 or d > 6 then
        raise exception 'Pick a night from 0 to 6.';
      end if;
      if d = any (touched) then
        raise exception 'A night can only be listed once per save.';
      end if;
      touched := touched || d;
      dow := extract(dow from wk.starts_on + d)::int;
      everyone := coalesce((item ->> 'everyone')::boolean, false);

      if not everyone then
        n_members := coalesce(jsonb_array_length(item -> 'membership_ids'), 0);
        n_eaters := coalesce(jsonb_array_length(item -> 'eater_ids'), 0);
        listed := n_members + n_eaters;
        g := coalesce((item ->> 'guests')::int, 0);

        if listed < 1 then
          raise exception 'Pick at least one person, or choose Everyone. To skip dinner, set the night to Off.';
        end if;
        if g < 0 or listed + g > 12 then
          raise exception 'Too many plates for one night.';
        end if;
        -- every id must belong to THIS household
        if exists (
          select 1 from jsonb_array_elements_text(coalesce(item -> 'membership_ids', '[]'::jsonb)) x(id)
          where not exists (
            select 1 from public.memberships m
            where m.id = x.id::uuid and m.household_id = wk.household_id
          )
        ) or exists (
          select 1 from jsonb_array_elements_text(coalesce(item -> 'eater_ids', '[]'::jsonb)) x(id)
          where not exists (
            select 1 from public.household_eaters e
            where e.id = x.id::uuid and e.household_id = wk.household_id
          )
        ) then
          raise exception 'Someone listed is not in this household.';
        end if;

        -- the list wins: plates = people + guests
        effective[dow + 1] := listed + g;
      end if;

      planned := planned || jsonb_build_array(
        item || jsonb_build_object('everyone', everyone, 'day_index', d, 'guests', coalesce((item ->> 'guests')::int, 0))
      );
    end loop;
  end if;

  -- Nights that already have a list and are not part of this save: the list still wins.
  for lst in
    select l.day_index, l.guests,
      (select count(*) from public.week_night_attendees a
        where a.week_id = l.week_id and a.day_index = l.day_index) as people
    from public.week_night_lists l
    where l.week_id = target_week and not (l.day_index = any (touched))
  loop
    dow := extract(dow from wk.starts_on + lst.day_index)::int;
    if effective[dow + 1] > 0 and lst.people > 0 then
      effective[dow + 1] := lst.people + lst.guests;
    end if;
  end loop;

  result := public.save_week_people(target_week, effective, instructions);

  if p_attendees is not null then
    for item in select * from jsonb_array_elements(planned) loop
      d := (item ->> 'day_index')::int;
      delete from public.week_night_lists where week_id = target_week and day_index = d;

      if not coalesce((item ->> 'everyone')::boolean, false) then
        insert into public.week_night_lists (household_id, week_id, day_index, guests, updated_by)
        values (wk.household_id, target_week, d, (item ->> 'guests')::int, uid);

        insert into public.week_night_attendees
          (household_id, week_id, day_index, membership_id, created_by)
        select wk.household_id, target_week, d, x.id::uuid, uid
        from jsonb_array_elements_text(coalesce(item -> 'membership_ids', '[]'::jsonb)) x(id);

        insert into public.week_night_attendees
          (household_id, week_id, day_index, eater_id, created_by)
        select wk.household_id, target_week, d, x.id::uuid, uid
        from jsonb_array_elements_text(coalesce(item -> 'eater_ids', '[]'::jsonb)) x(id);
      end if;
    end loop;

    if to_regprocedure('private.refresh_food_holds(uuid)') is not null then
      perform private.refresh_food_holds(wk.household_id);
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.save_week_people_v2(uuid, integer[], text, jsonb) from public, anon;
grant execute on function public.save_week_people_v2(uuid, integer[], text, jsonb) to authenticated;

comment on function public.save_week_people_v2(uuid, integer[], text, jsonb) is
  'Saves plates (via save_week_people) and optional per-night named lists. On a named-list night plates = people + guests (list wins, up or down). Everyone nights keep the free plate count. Does not wake the bot.';

-- Next-week gate. Same shape as save_planning_people plus attendees.
create or replace function public.save_planning_people_v2(
  counts integer[],
  instructions text,
  p_attendees jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  member_role text;
  cooking public.weeks%rowtype;
  wid uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id, m.role into hid, member_role
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null or member_role not in ('owner', 'voter') then
    raise exception 'Eaters can look, not change this week.';
  end if;

  select * into cooking from private.open_cooking_week(hid);
  if cooking.id is null then
    raise exception 'This household has no cooking week yet.';
  end if;

  select id into wid
  from public.weeks
  where household_id = hid
    and starts_on = cooking.starts_on + 7;

  if wid is null then
    raise exception 'Next week is not open yet.';
  end if;

  return public.save_week_people_v2(wid, counts, instructions, p_attendees);
end;
$$;

revoke all on function public.save_planning_people_v2(integer[], text, jsonb) from public, anon;
grant execute on function public.save_planning_people_v2(integer[], text, jsonb) to authenticated;

comment on function public.save_planning_people_v2(integer[], text, jsonb) is
  'Next week plates plus attendees via save_week_people_v2. Does not change House defaults. Does not wake the bot.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'week_night_attendees'
     ) then
    alter publication supabase_realtime add table public.week_night_attendees;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'week_night_lists'
     ) then
    alter publication supabase_realtime add table public.week_night_lists;
  end if;
end $$;
