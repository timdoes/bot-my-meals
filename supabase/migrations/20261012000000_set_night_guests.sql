-- Guests for one named-list night (the Request-a-new-dinner People stepper on such a night).
-- On a named-list night plates = people listed + guests; this changes only guests, keeps the
-- listed people, and goes through save_week_people_v2 so servings, recipes, and the ballot
-- request stay in step exactly as a normal plates edit. Everyone nights have no list and are
-- not touched (their stepper is the free plate count).
-- Does not wake the bot. Admin or User of that household only.
-- Requires 20261011221000_week_night_attendees.sql.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.

create or replace function public.set_night_guests(
  p_week uuid,
  p_day smallint,
  p_guests integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wk public.weeks%rowtype;
  counts integer[];
  members jsonb;
  eaters jsonb;
  has_list boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into wk from public.weeks where id = p_week;
  if wk.id is null then
    raise exception 'That week is not in this household.';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.household_id = wk.household_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'voter')
  ) then
    raise exception 'Eaters can look, not change nights.';
  end if;

  select true into has_list
  from public.week_night_lists l
  where l.week_id = p_week and l.day_index = p_day;
  if has_list is not true then
    raise exception 'That night has no named list.';
  end if;

  if p_guests is null or p_guests < 0 then
    raise exception 'Guests cannot be below zero.';
  end if;

  select coalesce(jsonb_agg(a.membership_id), '[]'::jsonb) into members
  from public.week_night_attendees a
  where a.week_id = p_week and a.day_index = p_day and a.membership_id is not null;

  select coalesce(jsonb_agg(a.eater_id), '[]'::jsonb) into eaters
  from public.week_night_attendees a
  where a.week_id = p_week and a.day_index = p_day and a.eater_id is not null;

  counts := coalesce(
    wk.night_headcounts,
    (select h.night_headcounts from public.households h where h.id = wk.household_id)
  );

  perform public.save_week_people_v2(
    p_week,
    counts,
    null,
    jsonb_build_array(jsonb_build_object(
      'day_index', p_day,
      'membership_ids', members,
      'eater_ids', eaters,
      'guests', p_guests
    ))
  );
end;
$$;

revoke all on function public.set_night_guests(uuid, smallint, integer) from public;
grant execute on function public.set_night_guests(uuid, smallint, integer) to authenticated;

comment on function public.set_night_guests(uuid, smallint, integer) is
  'Sets guests on a named-list night (plates = people + guests). Keeps the listed people. Does not wake the bot.';
