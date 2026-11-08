-- One person, one household. claim_pending_invites and join_household_by_code
-- refuse a second house with the same user-facing error as claim_join_token.
-- Pending claims only the current house (or the oldest invite if none yet);
-- leftover other-house invites raise rather than insert a second membership.
-- Idempotent: create or replace. Revoke EXECUTE from public and anon.

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

    insert into public.memberships (household_id, user_id, role, display_name, email)
    values (invite.household_id, uid, invite.role, invite.display_name, invite.email)
    on conflict (household_id, user_id) do update
      set role = excluded.role,
          display_name = excluded.display_name,
          email = excluded.email;
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

  insert into public.memberships (household_id, user_id, role, display_name, email)
  values (
    hid,
    uid,
    coalesce(pending.role, 'voter'),
    coalesce(nullif(pending.display_name, ''), pname, 'Neighbor'),
    coalesce(pending.email, pemail)
  )
  on conflict (household_id, user_id) do nothing;

  if pending.id is not null then
    delete from public.household_invites where id = pending.id;
  end if;

  return hid;
end;
$$;

revoke all on function public.join_household_by_code(text) from public, anon;
grant execute on function public.join_household_by_code(text) to authenticated;
