-- Wizard v2: household size / nights / zip, no default TJ/Smith's
-- stores on create, and ballot_requests for Meal Ops.
--
-- setup_step scale: 1-7 wizard, 8 = done.
-- Legacy 1-6 rows remap in this file (6 was done).

alter table public.households
  drop constraint if exists households_setup_step_check;

alter table public.households
  add column if not exists household_size integer not null default 4
    check (household_size >= 1 and household_size <= 12),
  add column if not exists nights_planned smallint not null default 7
    check (nights_planned >= 1 and nights_planned <= 7),
  add column if not exists postal_code text;

update public.households
set household_size = greatest(1, least(12, coalesce(family_size, 4)))
where household_size is distinct from greatest(1, least(12, coalesce(family_size, 4)));

update public.households
set nights_planned = greatest(
  1,
  least(
    7,
    (
      select count(*)::int
      from unnest(coalesce(night_headcounts, '{}'::integer[])) as c
      where c > 0
    )
  )
)
where night_headcounts is not null
  and cardinality(night_headcounts) = 7;

-- Remap leftover v1 steps (invite=1 stays). Done was 6.
update public.households
set setup_step = case setup_step
  when 1 then 1
  when 2 then 4
  when 3 then 5
  when 4 then 6
  when 5 then 7
  when 6 then 8
  else setup_step
end
where setup_step between 1 and 6;

alter table public.households
  alter column setup_step set default 8;

alter table public.households
  add constraint households_setup_step_check
  check (setup_step >= 1 and setup_step <= 8);

-- Meal Ops inbox. App (Admin) writes pending. Meal Ops writes meals;
-- a trigger marks the matching pending row fulfilled. Service role
-- may also update status. Household members can read their rows.
create table if not exists public.ballot_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null references public.weeks (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'cancelled')),
  household_size integer not null
    check (household_size >= 1 and household_size <= 12),
  nights_planned smallint not null
    check (nights_planned >= 1 and nights_planned <= 7),
  night_headcounts integer[] not null
    check (cardinality(night_headcounts) = 7),
  store_names text[] not null default '{}',
  weekly_budget_cents integer
    check (weekly_budget_cents is null or weekly_budget_cents >= 0),
  postal_code text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create unique index if not exists ballot_requests_one_pending_per_week
  on public.ballot_requests (household_id, week_id)
  where status = 'pending';

create index if not exists ballot_requests_pending_created_idx
  on public.ballot_requests (created_at)
  where status = 'pending';

create index if not exists ballot_requests_household_week_idx
  on public.ballot_requests (household_id, week_id, created_at desc);

comment on table public.ballot_requests is
  'Week meal ballot request. Admin app writes pending with a plates/nights/stores/budget snapshot. Meal Ops writes meals for that week; status becomes fulfilled.';

comment on column public.ballot_requests.status is
  'pending = waiting for Meal Ops; fulfilled = meals written; cancelled = abandoned.';

comment on column public.ballot_requests.night_headcounts is
  'Sun–Sat plates snapshot. 0 = off night. Labels only — never invent grocery prices.';

comment on column public.ballot_requests.store_names is
  'Store labels only. Never claim Smith''s (or any store) cart adds.';

alter table public.ballot_requests enable row level security;

drop policy if exists ballot_requests_member_read on public.ballot_requests;
create policy ballot_requests_member_read on public.ballot_requests
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists ballot_requests_owner_write on public.ballot_requests;
create policy ballot_requests_owner_write on public.ballot_requests
  for all to authenticated
  using (
    household_id in (
      select household_id from public.memberships
      where user_id = auth.uid() and role = 'owner'
    )
  )
  with check (
    household_id in (
      select household_id from public.memberships
      where user_id = auth.uid() and role = 'owner'
    )
  );

grant select, insert, update, delete on public.ballot_requests to authenticated;
grant all on public.ballot_requests to service_role;

create or replace function private.fulfill_ballot_request_for_week()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ballot_requests
  set
    status = 'fulfilled',
    fulfilled_at = coalesce(fulfilled_at, now()),
    updated_at = now()
  where household_id = new.household_id
    and week_id = new.week_id
    and status = 'pending';
  return new;
end;
$$;

drop trigger if exists meals_fulfill_ballot_request on public.meals;
create trigger meals_fulfill_ballot_request
  after insert on public.meals
  for each row
  execute function private.fulfill_ballot_request_for_week();

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
  h public.households%rowtype;
  stores text[];
  rid uuid;
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

  select id into wid
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
      requested_by
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
      uid
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

-- New houses start empty of stores. Existing houses keep whatever they have.
create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  starts date;
  label text := nullif(trim(household_name), '');
  pname text;
  pemail text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if label is null then
    raise exception 'Give the household a name.';
  end if;

  select m.household_id into hid
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is not null then
    if not exists (select 1 from public.weeks w where w.household_id = hid) then
      starts := private.week_start(0, current_date);
      insert into public.weeks (household_id, starts_on, status)
      values (hid, starts, 'voting');
    end if;
    return hid;
  end if;

  insert into public.profiles (id, email, display_name)
  select
    u.id,
    u.email,
    coalesce(
      u.raw_user_meta_data ->> 'display_name',
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Neighbor'
    )
  from auth.users u
  where u.id = uid
  on conflict (id) do nothing;

  select display_name, email into pname, pemail
  from public.profiles
  where id = uid;

  insert into public.households (
    name,
    setup_step,
    household_size,
    nights_planned,
    family_size,
    couple_size,
    night_headcounts
  )
  values (
    label,
    1,
    2,
    5,
    2,
    2,
    '{2,2,2,2,2,0,0}'
  )
  returning id into hid;

  insert into public.memberships (household_id, user_id, role, display_name, email)
  values (
    hid,
    uid,
    'owner',
    coalesce(nullif(pname, ''), 'Neighbor'),
    pemail
  );

  if not found then
    raise exception 'Could not add you to this household.';
  end if;

  starts := private.week_start(0, current_date);
  insert into public.weeks (household_id, starts_on, status)
  values (hid, starts, 'voting');

  perform private.mint_join_token(hid, uid);

  return hid;
end;
$$;

grant execute on function public.create_household(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.ballot_requests;
exception
  when duplicate_object then null;
end $$;
