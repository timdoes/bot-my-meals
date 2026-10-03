-- Trade two dinners inside the open cooking week or the next week.
-- Title, pitch, prep, leftovers, and the recipe body move.
-- The night keeps its servings. Week headcounts, House defaults, and stores stay.
-- Does not call the bot.

create or replace function public.reorder_week_meals(source_meal uuid, target_meal uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  member_role text;
  house_tz text;
  today date;
  cooking public.weeks%rowtype;
  target_week public.weeks%rowtype;
  source_row public.meals%rowtype;
  target_row public.meals%rowtype;
  recipe_s public.recipes%rowtype;
  recipe_t public.recipes%rowtype;
  has_recipe_s boolean;
  has_recipe_t boolean;
  source_blocked boolean;
  target_blocked boolean;
  leftover_for_source uuid;
  leftover_for_target uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if source_meal is null or target_meal is null or source_meal = target_meal then
    raise exception 'Pick another meal.';
  end if;

  select m.household_id, m.role into hid, member_role
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null or member_role not in ('owner', 'voter') then
    raise exception 'Eaters can look, not move meals.';
  end if;

  select * into source_row from public.meals where id = source_meal for update;
  if not found or source_row.household_id is distinct from hid then
    raise exception 'That meal is not in this household.';
  end if;

  select * into target_row from public.meals where id = target_meal for update;
  if not found or target_row.household_id is distinct from hid then
    raise exception 'That meal is not in this household.';
  end if;

  if source_row.week_id is distinct from target_row.week_id then
    raise exception 'Those meals are not in the same week.';
  end if;

  select * into target_week from public.weeks where id = source_row.week_id;
  if target_week.id is null then
    raise exception 'That week is not in this household.';
  end if;

  select * into cooking from private.open_cooking_week(hid);
  if cooking.id is null
    or (
      target_week.starts_on is distinct from cooking.starts_on
      and target_week.starts_on is distinct from cooking.starts_on + 7
    ) then
    raise exception 'Only this week and next week can move meals.';
  end if;

  if target_week.status = 'locked' then
    raise exception 'Unlock this week before moving meals.';
  end if;

  if btrim(coalesce(source_row.title, '')) = '' or btrim(coalesce(target_row.title, '')) = '' then
    raise exception 'That night cannot move.';
  end if;

  select exists (
    select 1
    from (
      select distinct on (v.meal_id) v.choice
      from public.votes v
      join public.memberships mem on mem.id = v.membership_id
      where v.meal_id = source_row.id
        and mem.role in ('owner', 'voter')
      order by v.meal_id, v.updated_at desc, v.id desc
    ) latest
    where latest.choice in ('remove', 'skip', 'request_new_meal')
  ) into source_blocked;

  select exists (
    select 1
    from (
      select distinct on (v.meal_id) v.choice
      from public.votes v
      join public.memberships mem on mem.id = v.membership_id
      where v.meal_id = target_row.id
        and mem.role in ('owner', 'voter')
      order by v.meal_id, v.updated_at desc, v.id desc
    ) latest
    where latest.choice in ('remove', 'skip', 'request_new_meal')
  ) into target_blocked;

  if source_blocked or target_blocked then
    raise exception 'That night cannot move.';
  end if;

  select h.timezone into house_tz from public.households h where h.id = hid;
  today := (now() at time zone coalesce(nullif(btrim(house_tz), ''), 'America/Los_Angeles'))::date;

  if source_row.night_date < today or target_row.night_date < today then
    raise exception 'That night is already past.';
  end if;

  if target_week.editable_from is not null
    and (
      source_row.night_date < target_week.editable_from
      or target_row.night_date < target_week.editable_from
    ) then
    raise exception 'That night is already past.';
  end if;

  leftover_for_source := target_row.leftover_of_meal_id;
  if leftover_for_source = source_meal then
    leftover_for_source := target_meal;
  elsif leftover_for_source = target_meal then
    leftover_for_source := source_meal;
  end if;

  leftover_for_target := source_row.leftover_of_meal_id;
  if leftover_for_target = source_meal then
    leftover_for_target := target_meal;
  elsif leftover_for_target = target_meal then
    leftover_for_target := source_meal;
  end if;

  update public.meals m
  set
    title = case m.id when source_meal then target_row.title else source_row.title end,
    pitch = case m.id when source_meal then target_row.pitch else source_row.pitch end,
    prep_minutes = case m.id when source_meal then target_row.prep_minutes else source_row.prep_minutes end,
    is_leftovers = case m.id when source_meal then target_row.is_leftovers else source_row.is_leftovers end,
    leftover_of_meal_id = case m.id when source_meal then leftover_for_source else leftover_for_target end
  where m.id in (source_meal, target_meal);

  select * into recipe_s from public.recipes where meal_id = source_meal for update;
  has_recipe_s := found;
  select * into recipe_t from public.recipes where meal_id = target_meal for update;
  has_recipe_t := found;

  if has_recipe_s and has_recipe_t then
    update public.recipe_ingredients ingredient
    set recipe_id = case ingredient.recipe_id
      when recipe_s.id then recipe_t.id
      when recipe_t.id then recipe_s.id
      else ingredient.recipe_id
    end
    where ingredient.recipe_id in (recipe_s.id, recipe_t.id);

    update public.recipes recipe
    set
      steps = case recipe.id when recipe_s.id then recipe_t.steps else recipe_s.steps end,
      prep_minutes = case recipe.id when recipe_s.id then recipe_t.prep_minutes else recipe_s.prep_minutes end,
      cook_minutes = case recipe.id when recipe_s.id then recipe_t.cook_minutes else recipe_s.cook_minutes end,
      recipe_key = case recipe.id when recipe_s.id then recipe_t.recipe_key else recipe_s.recipe_key end
    where recipe.id in (recipe_s.id, recipe_t.id);
  elsif has_recipe_s then
    -- The recipe row changes nights. Its serving count follows the destination
    -- meal's existing servings. The meal row's servings are not written.
    update public.recipes
    set meal_id = target_meal, servings = target_row.servings
    where id = recipe_s.id;
  elsif has_recipe_t then
    update public.recipes
    set meal_id = source_meal, servings = source_row.servings
    where id = recipe_t.id;
  end if;
end;
$$;

revoke all on function public.reorder_week_meals(uuid, uuid) from public;
grant execute on function public.reorder_week_meals(uuid, uuid) to authenticated;

comment on function public.reorder_week_meals(uuid, uuid) is
  'Trades two dinners inside the viewed week. Servings, week headcounts, stores, and House defaults stay on the night.';
