-- Household-shared saved meals.
-- Pool for later ballots, not a weekly guarantee.
-- Cool-down is 21 days (3 weeks) after last_locked_at — the last locked cook —
-- not the save tap. Request for next week sets requested_for_week and bypasses it.
-- Meal Ops reads public.saved_meals (service role) or public.saved_meal_pool().
-- Explicit requests also land on ballot_requests.saved_recipe_keys for that week.

alter table public.recipes
  add column if not exists recipe_key text;

comment on column public.recipes.recipe_key is
  'Optional stable id Meal Ops stamps so a dinner can match a saved meal across weeks. The app falls back to the normalized title when this is blank.';

create index if not exists recipes_household_recipe_key_idx
  on public.recipes (household_id, recipe_key)
  where recipe_key is not null;

create or replace function private.saved_meal_recipe_key(stamped text, title text)
returns text
language sql
immutable
as $$
  select nullif(
    coalesce(
      nullif(btrim(stamped), ''),
      lower(regexp_replace(btrim(coalesce(title, '')), '[[:space:]]+', ' ', 'g'))
    ),
    ''
  );
$$;

revoke all on function private.saved_meal_recipe_key(text, text) from public;

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_key text not null,
  title text not null,
  saved_at timestamptz not null default now(),
  last_locked_at timestamptz,
  requested_for_week date,
  source_recipe_id uuid references public.recipes (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (household_id, recipe_key),
  check (char_length(btrim(recipe_key)) > 0),
  check (char_length(btrim(title)) > 0)
);

create index if not exists saved_meals_household_saved_idx
  on public.saved_meals (household_id, saved_at desc);

create index if not exists saved_meals_requested_idx
  on public.saved_meals (household_id, requested_for_week)
  where requested_for_week is not null;

comment on table public.saved_meals is
  'Household-shared save pool. One row per recipe identity. Not a private shelf and not a guaranteed weekly slot. Meal Ops may randomly re-suggest after cool-down, or must consider requested_for_week (cool-down bypass).';

comment on column public.saved_meals.recipe_key is
  'Stable recipe identity: recipes.recipe_key when Meal Ops stamped one, otherwise the normalized dinner title.';

comment on column public.saved_meals.saved_at is
  'When the house saved this meal. Does not start cool-down.';

comment on column public.saved_meals.last_locked_at is
  'Last time this meal was a non-removed dinner on a locked week. Random re-suggest waits 21 days (3 weeks) after this instant. Null until the first locked cook.';

comment on column public.saved_meals.requested_for_week is
  'weeks.starts_on the house asked to cook again. Bypasses cool-down for that week. Null when not requested. Cleared on remove, and when a matching dinner lands on that week.';

comment on column public.saved_meals.source_recipe_id is
  'Recipe row at save time, when it still exists. Not a promise the full recipe lives forever.';

alter table public.saved_meals enable row level security;

drop policy if exists saved_meals_member_read on public.saved_meals;
create policy saved_meals_member_read on public.saved_meals
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists saved_meals_voter_write on public.saved_meals;
create policy saved_meals_voter_write on public.saved_meals
  for all to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = saved_meals.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = saved_meals.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

grant select, insert, update, delete on public.saved_meals to authenticated;
grant all on public.saved_meals to service_role;

-- Lock stamps cool-down from the locked cook, not from the save tap.
create or replace function private.stamp_saved_meals_on_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'locked' and old.status is distinct from 'locked' then
    update public.saved_meals sm
    set
      last_locked_at = coalesce(new.locked_at, now()),
      title = matched.title,
      requested_for_week = case
        when sm.requested_for_week is not null and sm.requested_for_week <= new.starts_on then null
        else sm.requested_for_week
      end,
      updated_at = now()
    from (
      select distinct on (recipe_key)
        recipe_key,
        title
      from (
        select
          private.saved_meal_recipe_key(r.recipe_key, m.title) as recipe_key,
          btrim(m.title) as title
        from public.meals m
        left join public.recipes r on r.meal_id = m.id
        where m.week_id = new.id
          and m.household_id = new.household_id
          and m.is_leftovers = false
          and char_length(btrim(m.title)) > 0
          and not exists (
            select 1
            from (
              select distinct on (v.meal_id) v.choice
              from public.votes v
              join public.memberships mem on mem.id = v.membership_id
              where v.meal_id = m.id
                and mem.role in ('owner', 'voter')
              order by v.meal_id, v.updated_at desc, v.id desc
            ) latest
            where latest.choice in ('remove', 'skip', 'request_new_meal')
          )
      ) keyed
      where recipe_key is not null
      order by recipe_key, title
    ) matched
    where sm.household_id = new.household_id
      and sm.recipe_key = matched.recipe_key;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_saved_meals_on_lock() from public;

drop trigger if exists weeks_stamp_saved_meals on public.weeks;
create trigger weeks_stamp_saved_meals
  after update of status on public.weeks
  for each row
  execute function private.stamp_saved_meals_on_lock();

-- Bot consumed the request once a matching dinner exists on that week.
create or replace function private.clear_saved_meal_request_on_meal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starts date;
  key text;
begin
  select w.starts_on into starts
  from public.weeks w
  where w.id = new.week_id;

  key := private.saved_meal_recipe_key(null, new.title);
  if starts is null or key is null then
    return new;
  end if;

  update public.saved_meals
  set requested_for_week = null, updated_at = now()
  where household_id = new.household_id
    and requested_for_week = starts
    and recipe_key = key;
  return new;
end;
$$;

revoke all on function private.clear_saved_meal_request_on_meal() from public;

drop trigger if exists meals_clear_saved_request on public.meals;
create trigger meals_clear_saved_request
  after insert or update of title on public.meals
  for each row
  execute function private.clear_saved_meal_request_on_meal();

create or replace function private.clear_saved_meal_request_on_recipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  starts date;
  hid uuid;
  meal_title text;
  key text;
begin
  select m.household_id, m.title, w.starts_on
    into hid, meal_title, starts
  from public.meals m
  join public.weeks w on w.id = m.week_id
  where m.id = new.meal_id;

  key := private.saved_meal_recipe_key(new.recipe_key, meal_title);
  if hid is null or starts is null or key is null then
    return new;
  end if;

  update public.saved_meals
  set requested_for_week = null, updated_at = now()
  where household_id = hid
    and requested_for_week = starts
    and recipe_key = key;
  return new;
end;
$$;

revoke all on function private.clear_saved_meal_request_on_recipe() from public;

drop trigger if exists recipes_clear_saved_request on public.recipes;
create trigger recipes_clear_saved_request
  after insert or update of recipe_key on public.recipes
  for each row
  execute function private.clear_saved_meal_request_on_recipe();

alter table public.ballot_requests
  add column if not exists saved_recipe_keys text[] not null default '{}',
  add column if not exists saved_pool_keys text[] not null default '{}';

comment on column public.ballot_requests.saved_recipe_keys is
  'Saved meals explicitly requested for this week (requested_for_week = weeks.starts_on). Cool-down bypass. Not the whole pool. Live rows stay on public.saved_meals.';

comment on column public.ballot_requests.saved_pool_keys is
  'Saved meals eligible for a random suggest when this ballot was created. Excludes the 21-day cool-down and any outstanding request. A hint, not a guarantee every one appears.';

-- Keep a pending ballot_request in sync when a voter requests or cancels.
create or replace function private.refresh_ballot_saved_keys(hid uuid, starts date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if hid is null or starts is null then
    return;
  end if;

  update public.ballot_requests br
  set
    saved_recipe_keys = (
      select coalesce(array_agg(sm.recipe_key order by sm.saved_at desc), '{}')
      from public.saved_meals sm
      where sm.household_id = hid
        and sm.requested_for_week = starts
    ),
    updated_at = now()
  from public.weeks w
  where br.week_id = w.id
    and br.household_id = hid
    and br.status = 'pending'
    and w.starts_on = starts;
end;
$$;

revoke all on function private.refresh_ballot_saved_keys(uuid, date) from public;

create or replace function private.sync_saved_meal_ballot_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if tg_op = 'DELETE' then
    hid := old.household_id;
    if old.requested_for_week is not null then
      perform private.refresh_ballot_saved_keys(hid, old.requested_for_week);
    end if;
    return old;
  end if;

  hid := new.household_id;
  if new.requested_for_week is not null then
    perform private.refresh_ballot_saved_keys(hid, new.requested_for_week);
  end if;
  if tg_op = 'UPDATE'
    and old.requested_for_week is distinct from new.requested_for_week
    and old.requested_for_week is not null then
    perform private.refresh_ballot_saved_keys(hid, old.requested_for_week);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_saved_meal_ballot_keys() from public;

drop trigger if exists saved_meals_sync_ballot_keys on public.saved_meals;
create trigger saved_meals_sync_ballot_keys
  after insert or update or delete on public.saved_meals
  for each row
  execute function private.sync_saved_meal_ballot_keys();

-- Signed-in household read for Meal Ops using the member session.
-- ballot_role matches the app helper: requested bypasses cool-down for target_starts.
create or replace function public.saved_meal_pool(target_starts date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id into hid
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipe_key', sm.recipe_key,
        'title', sm.title,
        'saved_at', sm.saved_at,
        'last_locked_at', sm.last_locked_at,
        'requested_for_week', sm.requested_for_week,
        'source_recipe_id', sm.source_recipe_id,
        'ballot_role', case
          when target_starts is not null and sm.requested_for_week = target_starts then 'requested'
          when sm.requested_for_week is not null
            and (target_starts is null or sm.requested_for_week is distinct from target_starts) then 'cooldown'
          when sm.last_locked_at is not null
            and sm.last_locked_at > now() - interval '21 days' then 'cooldown'
          else 'pool'
        end
      )
      order by sm.saved_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.saved_meals sm
  where sm.household_id = hid;

  return result;
end;
$$;

revoke all on function public.saved_meal_pool(date) from public;
grant execute on function public.saved_meal_pool(date) to authenticated;

comment on function public.saved_meal_pool(date) is
  'Household save pool for the signed-in member. ballot_role requested = include even inside the 21-day cool-down. pool = eligible for a random suggest. cooldown = skip. Service role may also select public.saved_meals directly.';

-- Propose path: a new or refreshed week ballot carries explicit saved-meal requests.
create or replace function public.request_week_ballot()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  wid uuid;
  starts date;
  h public.households%rowtype;
  stores text[];
  rid uuid;
  keys text[];
  pool text[];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into hid
  from public.memberships
  where user_id = uid and role = 'owner'
  order by created_at asc
  limit 1;

  if hid is null then
    raise exception 'Only an Admin can create this week''s meals.';
  end if;

  select * into h from public.households where id = hid;
  if not found then
    raise exception 'Household not found';
  end if;

  select id, starts_on into wid, starts
  from public.weeks
  where household_id = hid
  order by starts_on desc
  limit 1;

  if wid is null then
    raise exception 'This household has no week yet.';
  end if;

  select coalesce(array_agg(name order by sort_order, name), '{}')
  into stores
  from public.household_stores
  where household_id = hid;

  select coalesce(array_agg(sm.recipe_key order by sm.saved_at desc), '{}')
  into keys
  from public.saved_meals sm
  where sm.household_id = hid
    and sm.requested_for_week = starts;

  select coalesce(array_agg(sm.recipe_key order by sm.saved_at desc), '{}')
  into pool
  from public.saved_meals sm
  where sm.household_id = hid
    and sm.requested_for_week is null
    and (
      sm.last_locked_at is null
      or sm.last_locked_at <= now() - interval '21 days'
    );

  select id into rid
  from public.ballot_requests
  where household_id = hid
    and week_id = wid
    and status = 'pending'
  order by created_at desc
  limit 1;

  if rid is not null then
    update public.ballot_requests
    set
      household_size = h.household_size,
      nights_planned = h.nights_planned,
      night_headcounts = h.night_headcounts,
      store_names = stores,
      weekly_budget_cents = h.weekly_budget_cents,
      postal_code = h.postal_code,
      requested_by = uid,
      saved_recipe_keys = keys,
      saved_pool_keys = pool,
      updated_at = now()
    where id = rid;
  else
    insert into public.ballot_requests (
      household_id,
      week_id,
      status,
      household_size,
      nights_planned,
      night_headcounts,
      store_names,
      weekly_budget_cents,
      postal_code,
      requested_by,
      saved_recipe_keys,
      saved_pool_keys
    )
    values (
      hid,
      wid,
      'pending',
      h.household_size,
      h.nights_planned,
      h.night_headcounts,
      stores,
      h.weekly_budget_cents,
      h.postal_code,
      uid,
      keys,
      pool
    )
    returning id into rid;
  end if;

  update public.households
  set setup_step = 8
  where id = hid
    and setup_step < 8;

  return rid;
end;
$$;

grant execute on function public.request_week_ballot() to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.saved_meals;
exception
  when duplicate_object then null;
end $$;
