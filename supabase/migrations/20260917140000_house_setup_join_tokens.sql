-- Post-create house setup progress, weekly meal budget target, and
-- textable /join/<token> invite links. Existing households skip the wizard
-- (setup_step defaults to 6). New create_household rows start at step 1.

alter table public.households
  add column if not exists setup_step smallint not null default 6
    check (setup_step >= 1 and setup_step <= 6),
  add column if not exists weekly_budget_cents integer
    check (weekly_budget_cents is null or weekly_budget_cents >= 0);

create table if not exists public.household_join_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid
);

alter table public.household_join_tokens enable row level security;

create policy household_join_tokens_owner_select on public.household_join_tokens
  for select to authenticated
  using (
    household_id in (
      select household_id from public.memberships
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- Table DML for owners (SELECT policy) and security-definer writes. No anon table grant:
-- signed-out clients call peek_join_token, which is security definer.
grant select, insert, update, delete on public.household_join_tokens to authenticated;
grant all on public.household_join_tokens to service_role;

create or replace function private.mint_join_token(hid uuid, actor uuid)
returns text
language plpgsql
as $$
declare
  next_token text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.household_join_tokens (household_id, token, expires_at, created_by)
  values (hid, next_token, now() + interval '14 days', actor);
  return next_token;
end;
$$;

create or replace function public.create_join_token(rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  existing text;
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
    raise exception 'Only an Admin can create an invite link.';
  end if;

  if not rotate then
    select token into existing
    from public.household_join_tokens
    where household_id = hid
      and revoked_at is null
      and expires_at > now()
    order by created_at desc
    limit 1;
    if existing is not null then
      return existing;
    end if;
  end if;

  update public.household_join_tokens
  set revoked_at = now()
  where household_id = hid
    and revoked_at is null;

  return private.mint_join_token(hid, uid);
end;
$$;

create or replace function public.peek_join_token(join_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.household_join_tokens%rowtype;
  hname text;
begin
  if join_token is null or length(trim(join_token)) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into row
  from public.household_join_tokens
  where token = trim(join_token);

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if row.revoked_at is not null then
    return jsonb_build_object('status', 'used');
  end if;

  if row.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select name into hname from public.households where id = row.household_id;

  return jsonb_build_object(
    'status', 'ok',
    'household_name', hname,
    'household_id', row.household_id
  );
end;
$$;

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

  insert into public.households (name, setup_step)
  values (label, 1)
  returning id into hid;

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

  insert into public.household_stores (household_id, name, slug, sort_order)
  values
    (hid, 'Trader Joe''s', 'trader-joes', 0),
    (hid, 'Smith''s', 'smiths', 1);

  starts := private.week_start(0, current_date);
  insert into public.weeks (household_id, starts_on, status)
  values (hid, starts, 'voting');

  perform private.mint_join_token(hid, uid);

  return hid;
end;
$$;

grant execute on function public.create_join_token(boolean) to authenticated;
grant execute on function public.peek_join_token(text) to anon, authenticated;
grant execute on function public.claim_join_token(text) to authenticated;
grant execute on function public.create_household(text) to authenticated;
