-- A night whose latest owner/voter vote is remove (or legacy skip) is not a dinner.
-- That vote counts even when it was saved before lock. lock_week inserts only
-- private.week_shopping_lines, so a removed night never lands on the list.
-- rebuild_week_shopping_list updates an existing list in place. It does not
-- invent a list, touch the other week, House defaults, or stores, and it does
-- not wake the bot.

create or replace function private.shopping_name_key(raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(raw, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function private.shopping_unit_key(raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(btrim(coalesce(raw, '')));
$$;

create or replace function private.night_is_off(target_meal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select v.choice in ('remove', 'skip')
    from public.votes v
    join public.memberships mem on mem.id = v.membership_id
    where v.meal_id = target_meal
      and mem.role in ('owner', 'voter')
      and v.choice in ('swap', 'remove', 'skip', 'request_new_meal')
    order by v.updated_at desc, v.id desc
    limit 1
  ), false);
$$;

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
  join public.recipes r on r.meal_id = m.id
  join public.recipe_ingredients ri on ri.recipe_id = r.id
  where m.week_id = target_week
    and not private.night_is_off(m.id)
  group by ri.store_id, private.shopping_name_key(ri.name), private.shopping_unit_key(ri.unit);
$$;

revoke all on function private.shopping_name_key(text) from public;
revoke all on function private.shopping_unit_key(text) from public;
revoke all on function private.night_is_off(uuid) from public;
revoke all on function private.week_shopping_lines(uuid) from public;

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

create or replace function public.rebuild_week_shopping_list(target_week uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  lid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select household_id into hid
  from public.memberships
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if hid is null then
    raise exception 'Not in a household';
  end if;

  if not exists (
    select 1
    from public.weeks w
    where w.id = target_week
      and w.household_id = hid
  ) then
    raise exception 'That week is not in this household.';
  end if;

  select id into lid
  from public.shopping_lists
  where week_id = target_week
    and household_id = hid;

  if lid is null then
    return;
  end if;

  delete from public.shopping_items si
  where si.shopping_list_id = lid
    and si.id not in (
      select distinct on (
        item.store_id,
        private.shopping_name_key(item.name),
        private.shopping_unit_key(item.unit)
      ) item.id
      from public.shopping_items item
      where item.shopping_list_id = lid
      order by
        item.store_id,
        private.shopping_name_key(item.name),
        private.shopping_unit_key(item.unit),
        item.id
    );

  update public.shopping_items si
  set quantity = lines.quantity,
      checked = false
  from private.week_shopping_lines(target_week) lines
  where si.shopping_list_id = lid
    and si.store_id = lines.store_id
    and private.shopping_name_key(si.name) = lines.name_key
    and private.shopping_unit_key(si.unit) = lines.unit_key
    and si.quantity is distinct from lines.quantity;

  delete from public.shopping_items si
  where si.shopping_list_id = lid
    and not exists (
      select 1
      from private.week_shopping_lines(target_week) lines
      where lines.store_id = si.store_id
        and lines.name_key = private.shopping_name_key(si.name)
        and lines.unit_key = private.shopping_unit_key(si.unit)
    );

  insert into public.shopping_items (
    household_id, shopping_list_id, store_id, name, quantity, unit
  )
  select hid, lid, lines.store_id, lines.name, lines.quantity, lines.unit
  from private.week_shopping_lines(target_week) lines
  where not exists (
    select 1
    from public.shopping_items si
    where si.shopping_list_id = lid
      and si.store_id = lines.store_id
      and private.shopping_name_key(si.name) = lines.name_key
      and private.shopping_unit_key(si.unit) = lines.unit_key
  );
end;
$$;

revoke all on function public.rebuild_week_shopping_list(uuid) from public;
grant execute on function public.rebuild_week_shopping_list(uuid) to authenticated;

comment on function public.lock_week(uuid) is
  'Locks the cooking week or the planning week and rebuilds that week''s shopping list only.';

comment on function public.rebuild_week_shopping_list(uuid) is
  'Reconciles an existing shopping list with the dinners still on that week. Does not create a list.';
