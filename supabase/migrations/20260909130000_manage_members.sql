-- Admins manage household memberships and pending invites.
-- Adding a person on Supabase cannot create auth.users; they appear as an invite
-- until they sign in and join (or claim_pending_invites matches their email).

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null,
  email text not null,
  role text not null default 'voter' check (role in ('owner', 'voter', 'eater')),
  created_at timestamptz not null default now(),
  unique (household_id, email)
);

alter table public.household_invites enable row level security;

create policy household_invites_owner_all on public.household_invites
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

grant select, insert, update, delete on public.household_invites to authenticated;
grant all on public.household_invites to service_role;

create or replace function private.protect_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      select count(*) into remaining
      from public.memberships
      where household_id = old.household_id
        and role = 'owner'
        and id <> old.id;
      if remaining < 1 then
        raise exception 'Keep at least one Admin.';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'owner' and new.role is distinct from 'owner' then
    select count(*) into remaining
    from public.memberships
    where household_id = old.household_id
      and role = 'owner'
      and id <> old.id;
    if remaining < 1 then
      raise exception 'Keep at least one Admin.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_protect_last_owner on public.memberships;
create trigger memberships_protect_last_owner
  before update or delete on public.memberships
  for each row execute function private.protect_last_owner();

create or replace function public.set_member_role(member_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  actor_role text;
begin
  if next_role not in ('owner', 'voter', 'eater') then
    raise exception 'Unknown role';
  end if;

  select m.household_id into hid
  from public.memberships m
  where m.id = member_id;

  if hid is null then
    raise exception 'That person is not in this household.';
  end if;

  select role into actor_role
  from public.memberships
  where household_id = hid and user_id = auth.uid();

  if actor_role is distinct from 'owner' then
    raise exception 'Only an Admin can change roles.';
  end if;

  update public.memberships
  set role = next_role
  where id = member_id;
end;
$$;

create or replace function public.remove_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  actor_role text;
begin
  select m.household_id into hid
  from public.memberships m
  where m.id = member_id;

  if hid is null then
    raise exception 'That person is not in this household.';
  end if;

  select role into actor_role
  from public.memberships
  where household_id = hid and user_id = auth.uid();

  if actor_role is distinct from 'owner' then
    raise exception 'Only an Admin can remove people.';
  end if;

  delete from public.memberships where id = member_id;
end;
$$;

create or replace function public.claim_pending_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  invite record;
begin
  if uid is null then
    return;
  end if;

  for invite in
    select i.*
    from public.household_invites i
    join public.profiles p on lower(p.email) = lower(i.email)
    where p.id = uid
  loop
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

grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.claim_pending_invites() to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
