-- Setup moves from 7 steps to 8 (new step 5 = Allergies and foods to skip).
-- New scale: 1-8 wizard (8 = Create meals), 9 = done.
-- EXPAND ONLY: widens the check, makes new rows default to done = 9, and makes the first ballot
-- request write 9. It changes NO existing row, so old app code keeps working (it clamps 9 to its
-- own done step). The one-time data remap is the next file, 20261011224500_setup_step_nine_remap.sql,
-- applied immediately before the 8-step app deploys.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.

alter table public.households
  drop constraint if exists households_setup_step_check;

alter table public.households
  add constraint households_setup_step_check
  check (setup_step >= 1 and setup_step <= 9);

alter table public.households
  alter column setup_step set default 9;

-- Same body as 20260928233000_planning_people_gate.sql public.request_week_ballot(date),
-- with the done step 8 -> 9 (only the two setup_step lines differ).
create or replace function public.request_week_ballot(target_starts date default null)
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
  cooking public.weeks%rowtype;
  h public.households%rowtype;
  stores text[];
  rid uuid;
  keys text[];
  pool text[];
  counts integer[];
  nights integer;
  notes text;
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

  select * into cooking from private.open_cooking_week(hid);
  if cooking.id is null then
    raise exception 'This household has no cooking week yet.';
  end if;

  if target_starts is null then
    wid := cooking.id;
    starts := cooking.starts_on;
  else
    if target_starts is distinct from cooking.starts_on
      and target_starts is distinct from cooking.starts_on + 7 then
      raise exception 'Only this week and next week can be open.';
    end if;

    select id, starts_on into wid, starts
    from public.weeks
    where household_id = hid
      and starts_on = target_starts;

    if wid is null then
      raise exception 'That week is not open yet.';
    end if;
  end if;

  select p.counts, p.nights, p.instructions into counts, nights, notes
  from private.ballot_plates(hid, wid) as p;

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
      nights_planned = nights,
      night_headcounts = counts,
      special_instructions = notes,
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
      special_instructions,
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
      nights,
      counts,
      notes,
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
  set setup_step = 9
  where id = hid
    and setup_step < 9;

  return rid;
end;
$$;

grant execute on function public.request_week_ballot(date) to authenticated;
