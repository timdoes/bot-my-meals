-- Close the join TOCTOU: unique(user_id) on memberships so two sessions cannot
-- insert a second house after both SELECTs saw none.
-- Preflight: if any login already has two memberships, raise and stop.
-- This migration does not delete or merge those rows. Resolve duplicates by
-- hand, then re-apply. Join RPCs map unique_violation to the same
-- 'You are already in a house.' error as the sequential guard.

do $$
declare
  dup_count integer;
  dup_sample text;
begin
  select count(*) into dup_count
  from (
    select m.user_id
    from public.memberships m
    group by m.user_id
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    select string_agg(s.user_id::text, ', ' order by s.user_id) into dup_sample
    from (
      select m.user_id
      from public.memberships m
      group by m.user_id
      having count(*) > 1
      order by m.user_id
      limit 20
    ) s;
    raise exception
      'memberships_one_user preflight failed: % login(s) already have more than one household membership (sample user_id: %). This migration does not delete or merge those rows. Resolve duplicates, then re-apply.',
      dup_count,
      dup_sample;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memberships_one_user'
      and conrelid = 'public.memberships'::regclass
  ) then
    alter table public.memberships
      add constraint memberships_one_user unique (user_id);
  end if;
end $$;

create or replace function public.claim_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  invite record;
  existing uuid;
  other uuid;
begin
  if uid is null then
    return;
  end if;

  select household_id into existing
  from public.memberships
  where user_id = uid
  order by created_at asc
  limit 1;

  if existing is not null then
    if exists (
      select 1
      from public.household_invites i
      join public.profiles p on lower(p.email) = lower(i.email)
      where p.id = uid
        and i.household_id is distinct from existing
    ) and not exists (
      select 1
      from public.household_invites i
      join public.profiles p on lower(p.email) = lower(i.email)
      where p.id = uid
        and i.household_id = existing
    ) then
      raise exception 'You are already in a house.';
    end if;
  else
    select i.household_id into existing
    from public.household_invites i
    join public.profiles p on lower(p.email) = lower(i.email)
    where p.id = uid
    order by i.created_at asc
    limit 1;
  end if;

  if existing is null then
    return;
  end if;

  for invite in
    select i.*
    from public.household_invites i
    join public.profiles p on lower(p.email) = lower(i.email)
    where p.id = uid
      and i.household_id = existing
  loop
    select household_id into other
    from public.memberships
    where user_id = uid
      and household_id is distinct from invite.household_id
    order by created_at asc
    limit 1;

    if other is not null then
      raise exception 'You are already in a house.';
    end if;

    begin
      insert into public.memberships (household_id, user_id, role, display_name, email)
      values (invite.household_id, uid, invite.role, invite.display_name, invite.email)
      on conflict (household_id, user_id) do update
        set role = excluded.role,
            display_name = excluded.display_name,
            email = excluded.email;
    exception
      when unique_violation then
        raise exception 'You are already in a house.';
    end;
    delete from public.household_invites where id = invite.id;
  end loop;
end;
$$;

revoke all on function public.claim_pending_invites() from public, anon;
grant execute on function public.claim_pending_invites() to authenticated;

create or replace function public.join_household_by_code(invite text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  pending public.household_invites%rowtype;
  pname text;
  pemail text;
  other uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id into hid
  from public.households
  where upper(invite_code) = upper(trim(invite));

  if hid is null then
    raise exception 'That invite code was not found';
  end if;

  if exists (
    select 1 from public.memberships
    where household_id = hid and user_id = uid
  ) then
    return hid;
  end if;

  select household_id into other
  from public.memberships
  where user_id = uid
  order by created_at asc
  limit 1;

  if other is not null then
    raise exception 'You are already in a house.';
  end if;

  select display_name, email into pname, pemail
  from public.profiles
  where id = uid;

  select * into pending
  from public.household_invites
  where household_id = hid
    and lower(email) = lower(coalesce(pemail, ''));

  begin
    insert into public.memberships (household_id, user_id, role, display_name, email)
    values (
      hid,
      uid,
      coalesce(pending.role, 'voter'),
      coalesce(nullif(pending.display_name, ''), pname, 'Neighbor'),
      coalesce(pending.email, pemail)
    )
    on conflict (household_id, user_id) do nothing;
  exception
    when unique_violation then
      raise exception 'You are already in a house.';
  end;

  if pending.id is not null then
    delete from public.household_invites where id = pending.id;
  end if;

  return hid;
end;
$$;

revoke all on function public.join_household_by_code(text) from public, anon;
grant execute on function public.join_household_by_code(text) to authenticated;

create or replace function public.claim_join_token(join_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  peeked jsonb;
  hid uuid;
  pending public.household_invites%rowtype;
  pname text;
  pemail text;
  other uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  peeked := public.peek_join_token(join_token);
  if peeked ->> 'status' = 'expired' then
    raise exception 'This invite link has expired. Ask your partner for a new link.';
  end if;
  if peeked ->> 'status' = 'used' then
    raise exception 'This invite link was already used. Ask your partner for a new link.';
  end if;
  if peeked ->> 'status' is distinct from 'ok' then
    raise exception 'This invite link is not valid. Ask your partner for a new link.';
  end if;

  hid := (peeked ->> 'household_id')::uuid;

  if exists (
    select 1 from public.memberships
    where household_id = hid and user_id = uid
  ) then
    return hid;
  end if;

  select household_id into other
  from public.memberships
  where user_id = uid
  order by created_at asc
  limit 1;

  if other is not null then
    raise exception 'You are already in a house.';
  end if;

  select display_name, email into pname, pemail
  from public.profiles
  where id = uid;

  select * into pending
  from public.household_invites
  where household_id = hid
    and lower(email) = lower(coalesce(pemail, ''));

  begin
    insert into public.memberships (household_id, user_id, role, display_name, email)
    values (
      hid,
      uid,
      coalesce(pending.role, 'voter'),
      coalesce(nullif(pending.display_name, ''), pname, 'Neighbor'),
      coalesce(pending.email, pemail)
    )
    on conflict (household_id, user_id) do nothing;
  exception
    when unique_violation then
      raise exception 'You are already in a house.';
  end;

  if pending.id is not null then
    delete from public.household_invites where id = pending.id;
  end if;

  return hid;
end;
$$;

revoke all on function public.claim_join_token(text) from public, anon;
grant execute on function public.claim_join_token(text) to authenticated;

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

  begin
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
  exception
    when unique_violation then
      raise exception 'You are already in a house.';
  end;

  starts := private.week_start(0, current_date);
  insert into public.weeks (household_id, starts_on, status)
  values (hid, starts, 'voting');

  perform private.mint_join_token(hid, uid);

  return hid;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
