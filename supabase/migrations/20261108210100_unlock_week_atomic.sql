-- Atomic unlock: one RPC sets weeks.status = voting and deletes shopping_lists.
-- rebuild_week_shopping_list refuses unless the week is locked, locking the week
-- row first so it cannot mutate a leftover list after unlock.
-- Idempotent: create or replace. Revoke EXECUTE from public and anon.

create or replace function public.unlock_week(target_week uuid, editable_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  actor_role text;
  target public.weeks%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id, m.role into hid, actor_role
  from public.memberships m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;

  if hid is null then
    raise exception 'Not in a household';
  end if;

  if actor_role is distinct from 'owner' then
    raise exception 'Only an Admin can unlock the week.';
  end if;

  select * into target
  from public.weeks w
  where w.id = target_week
    and w.household_id = hid
  for update;

  if target.id is null then
    raise exception 'That week is not in this household.';
  end if;

  update public.weeks w
  set status = 'voting',
      locked_at = null,
      editable_from = unlock_week.editable_from
  where w.id = target.id;

  delete from public.shopping_lists
  where week_id = target.id;
end;
$$;

revoke all on function public.unlock_week(uuid, date) from public, anon;
grant execute on function public.unlock_week(uuid, date) to authenticated;

create or replace function public.rebuild_week_shopping_list(target_week uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  lid uuid;
  week_status text;
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

  select w.status into week_status
  from public.weeks w
  where w.id = target_week
    and w.household_id = hid
  for update;

  if week_status is null then
    raise exception 'That week is not in this household.';
  end if;

  if week_status is distinct from 'locked' then
    return;
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

revoke all on function public.rebuild_week_shopping_list(uuid) from public, anon;
grant execute on function public.rebuild_week_shopping_list(uuid) to authenticated;
