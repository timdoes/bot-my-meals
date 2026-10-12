-- lock_week with the food-rules gate. Same body as 20261004180000_shopping_list_rebuild.sql
-- public.lock_week, plus one loop before the week locks: an Allergy rule that matches a dinner's
-- title or pitch for the people eating that night blocks the lock with `food_rule_needs_change`.
-- Intolerance and Dislike never block. Ships WITH the UI that explains the refusal (ship 4).
-- Requires 20261011220000, 20261011221000, 20261011222000.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.
-- Previous body for rollback: 20261004180000_shopping_list_rebuild.sql (public.lock_week).

create or replace function public.lock_week(target_week uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
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
  set status = 'locked'
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

revoke all on function public.lock_week(uuid) from public;
grant execute on function public.lock_week(uuid) to authenticated;

revoke all on function public.lock_week(uuid) from public;
grant execute on function public.lock_week(uuid) to authenticated;
