-- Lock gate matches checkWeekLock(todayIso): leftover swap / dinner request on a
-- night before house-local today must not block lock. Ignore those nights (do
-- not clear votes — ballot history stays). Remaining nights still block.
-- night_count is remaining nights, same as checkWeekLock counted.length.
-- Idempotent: create or replace of the existing trigger function.

create or replace function private.enforce_week_lock()
returns trigger
language plpgsql
as $$
declare
  voter_count integer;
  night_count integer;
  blockers integer;
  tz text;
  today date;
begin
  if new.status = 'locked' and old.status is distinct from 'locked' then
    select timezone into tz
    from public.households
    where id = new.household_id;
    today := private.house_local_date(tz);

    select count(*) into voter_count
    from public.memberships mem
    where mem.household_id = new.household_id
      and mem.role in ('owner', 'voter');

    select count(*) into night_count
    from public.meals m
    where m.week_id = new.id
      and m.night_date >= today;

    with latest as (
      select distinct on (v.meal_id)
        v.meal_id,
        v.choice
      from public.votes v
      join public.memberships mem on mem.id = v.membership_id
      join public.meals m on m.id = v.meal_id
      where m.week_id = new.id
        and m.night_date >= today
        and mem.role in ('owner', 'voter')
        and v.choice in ('swap', 'remove', 'request_new_meal')
      order by v.meal_id, v.updated_at desc, v.id desc
    )
    select count(*) into blockers
    from latest
    where choice in ('swap', 'request_new_meal');

    if voter_count = 0 then
      raise exception 'Week cannot lock without a voting member';
    end if;
    if night_count = 0 then
      raise exception 'Week cannot lock until this week has at least one night';
    end if;
    if blockers > 0 then
      raise exception 'Week cannot lock while a swap or new-meal request is open';
    end if;
    new.locked_at = coalesce(new.locked_at, now());
  end if;
  if new.status = 'voting' then
    new.locked_at = null;
  end if;
  return new;
end;
$$;
