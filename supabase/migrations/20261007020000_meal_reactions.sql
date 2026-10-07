-- Household thumbs-up (Favorites) and thumbs-down (Never again + notes).
-- Same Supabase project as every house. Rows are household-scoped. No second database.
-- Favorites stay on public.saved_meals (recipe_key identity).
-- Make next week sets requested_for_week and does not create a week and does not wake the bot.
-- Never again deletes that saved_meals row. Like text and dislike text can both exist.

create table if not exists public.meal_dislikes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_key text not null,
  title text not null,
  never_again boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (household_id, recipe_key),
  check (char_length(btrim(recipe_key)) > 0),
  check (char_length(btrim(title)) > 0),
  check (char_length(note) <= 500),
  check (never_again or char_length(btrim(note)) > 0)
);

create index if not exists meal_dislikes_household_idx
  on public.meal_dislikes (household_id, updated_at desc);

create index if not exists meal_dislikes_blocked_idx
  on public.meal_dislikes (household_id)
  where never_again;

comment on table public.meal_dislikes is
  'Household dislike for one recipe identity (same key as saved_meals). never_again blocks the whole meal from future ballots and favorites. A note with never_again false is part feedback and stays suggestable. Not a per-person shelf.';

comment on column public.meal_dislikes.recipe_key is
  'Stable recipe identity: recipes.recipe_key when Meal Ops stamped one, otherwise the normalized dinner title. Same key as public.saved_meals.';

comment on column public.meal_dislikes.note is
  'Optional "What didn’t you like?" text. Kept when Never again is cleared if the note is non-empty.';

create table if not exists public.meal_likes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_key text not null,
  title text not null,
  note text not null,
  created_at timestamptz not null default now(),
  check (char_length(btrim(recipe_key)) > 0),
  check (char_length(btrim(title)) > 0),
  check (char_length(btrim(note)) > 0),
  check (char_length(note) <= 500)
);

create index if not exists meal_likes_household_idx
  on public.meal_likes (household_id, created_at desc);

comment on table public.meal_likes is
  'Household like notes ("What did you like about this meal?"). Each Send appends a row. Not a list in the app. A meal can have like text and dislike text together. Favorites themselves live on public.saved_meals.';

alter table public.meal_dislikes enable row level security;
alter table public.meal_likes enable row level security;

drop policy if exists meal_dislikes_member_read on public.meal_dislikes;
create policy meal_dislikes_member_read on public.meal_dislikes
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists meal_dislikes_voter_write on public.meal_dislikes;
create policy meal_dislikes_voter_write on public.meal_dislikes
  for all to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = meal_dislikes.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = meal_dislikes.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists meal_likes_member_read on public.meal_likes;
create policy meal_likes_member_read on public.meal_likes
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists meal_likes_voter_insert on public.meal_likes;
create policy meal_likes_voter_insert on public.meal_likes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = meal_likes.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

grant select, insert, update, delete on public.meal_dislikes to authenticated;
grant select, insert on public.meal_likes to authenticated;

-- Never again drops the favorite and strips it from a pending ballot. No bot wake.
create or replace function private.block_meal_on_never_again()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'DELETE' and new.never_again then
    delete from public.saved_meals
    where household_id = new.household_id
      and recipe_key = new.recipe_key;

    update public.ballot_requests
    set
      saved_recipe_keys = array_remove(saved_recipe_keys, new.recipe_key),
      saved_pool_keys = array_remove(saved_pool_keys, new.recipe_key),
      updated_at = now()
    where household_id = new.household_id
      and status = 'pending'
      and (
        new.recipe_key = any (saved_recipe_keys)
        or new.recipe_key = any (saved_pool_keys)
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.block_meal_on_never_again() from public;

drop trigger if exists meal_dislikes_block_favorite on public.meal_dislikes;
create trigger meal_dislikes_block_favorite
  after insert or update of never_again on public.meal_dislikes
  for each row
  execute function private.block_meal_on_never_again();

-- A favorite clears Never again. A dislike note stays when it has text.
create or replace function private.clear_never_again_for_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.meal_dislikes
  where household_id = new.household_id
    and recipe_key = new.recipe_key
    and never_again
    and char_length(btrim(note)) = 0;

  update public.meal_dislikes
  set never_again = false, updated_at = now()
  where household_id = new.household_id
    and recipe_key = new.recipe_key
    and never_again;

  return new;
end;
$$;

revoke all on function private.clear_never_again_for_favorite() from public;

drop trigger if exists saved_meals_clear_never_again on public.saved_meals;
create trigger saved_meals_clear_never_again
  after insert or update on public.saved_meals
  for each row
  execute function private.clear_never_again_for_favorite();

-- Pending ballot copies cannot carry a blocked key, even if a write races the delete.
create or replace function private.strip_blocked_saved_keys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(array_agg(u.key order by u.ord), '{}')
  into new.saved_recipe_keys
  from unnest(coalesce(new.saved_recipe_keys, '{}')) with ordinality as u(key, ord)
  where not exists (
    select 1
    from public.meal_dislikes d
    where d.household_id = new.household_id
      and d.recipe_key = u.key
      and d.never_again
  );

  select coalesce(array_agg(u.key order by u.ord), '{}')
  into new.saved_pool_keys
  from unnest(coalesce(new.saved_pool_keys, '{}')) with ordinality as u(key, ord)
  where not exists (
    select 1
    from public.meal_dislikes d
    where d.household_id = new.household_id
      and d.recipe_key = u.key
      and d.never_again
  );

  return new;
end;
$$;

revoke all on function private.strip_blocked_saved_keys() from public;

drop trigger if exists ballot_requests_strip_blocked_keys on public.ballot_requests;
create trigger ballot_requests_strip_blocked_keys
  before insert or update of saved_recipe_keys, saved_pool_keys on public.ballot_requests
  for each row
  execute function private.strip_blocked_saved_keys();

create or replace function private.refresh_ballot_saved_keys(hid uuid, starts date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if hid is null or starts is null then
    return;
  end if;

  update public.ballot_requests br
  set
    saved_recipe_keys = (
      select coalesce(array_agg(sm.recipe_key order by sm.saved_at desc), '{}')
      from public.saved_meals sm
      where sm.household_id = hid
        and sm.requested_for_week = starts
        and not exists (
          select 1
          from public.meal_dislikes d
          where d.household_id = sm.household_id
            and d.recipe_key = sm.recipe_key
            and d.never_again
        )
    ),
    updated_at = now()
  from public.weeks w
  where br.week_id = w.id
    and br.household_id = hid
    and br.status = 'pending'
    and w.starts_on = starts;
end;
$$;

revoke all on function private.refresh_ballot_saved_keys(uuid, date) from public;

create or replace function public.saved_meal_pool(target_starts date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id into hid
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipe_key', sm.recipe_key,
        'title', sm.title,
        'saved_at', sm.saved_at,
        'last_locked_at', sm.last_locked_at,
        'requested_for_week', sm.requested_for_week,
        'source_recipe_id', sm.source_recipe_id,
        'ballot_role', case
          when target_starts is not null and sm.requested_for_week = target_starts then 'requested'
          when sm.requested_for_week is not null
            and (target_starts is null or sm.requested_for_week is distinct from target_starts) then 'cooldown'
          when sm.last_locked_at is not null
            and sm.last_locked_at > now() - interval '21 days' then 'cooldown'
          else 'pool'
        end
      )
      order by sm.saved_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.saved_meals sm
  where sm.household_id = hid
    and not exists (
      select 1
      from public.meal_dislikes d
      where d.household_id = sm.household_id
        and d.recipe_key = sm.recipe_key
        and d.never_again
    );

  return result;
end;
$$;

revoke all on function public.saved_meal_pool(date) from public;
grant execute on function public.saved_meal_pool(date) to authenticated;

comment on function public.saved_meal_pool(date) is
  'Household favorites for the signed-in member. Excludes Never again. ballot_role requested = Make next week for target_starts (cool-down bypass). pool = Make in ~3 weeks and outside the 21-day cool-down. cooldown = skip for a random suggest.';

-- Signed-in read for the next ballot. Service role may select the tables directly.
create or replace function public.meal_avoidance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id into hid
  from public.memberships m
  where m.user_id = uid
  order by m.created_at asc
  limit 1;

  if hid is null then
    return jsonb_build_object('never_again', '[]'::jsonb, 'dislike_notes', '[]'::jsonb, 'likes', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'never_again', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipe_key', d.recipe_key,
        'title', d.title,
        'note', d.note
      ) order by d.updated_at desc)
      from public.meal_dislikes d
      where d.household_id = hid
        and d.never_again
    ), '[]'::jsonb),
    'dislike_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipe_key', d.recipe_key,
        'title', d.title,
        'note', d.note
      ) order by d.updated_at desc)
      from public.meal_dislikes d
      where d.household_id = hid
        and not d.never_again
        and char_length(btrim(d.note)) > 0
    ), '[]'::jsonb),
    'likes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipe_key', l.recipe_key,
        'title', l.title,
        'note', l.note,
        'created_at', l.created_at
      ) order by l.created_at desc)
      from public.meal_likes l
      where l.household_id = hid
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.meal_avoidance() from public;
grant execute on function public.meal_avoidance() to authenticated;

comment on function public.meal_avoidance() is
  'Household Never again blocks, dislike part-notes, and like notes for the signed-in member. Blocks must not be suggested. Part notes and likes stay suggestable. Does not wake the bot.';

do $$
begin
  alter publication supabase_realtime add table public.meal_dislikes;
exception
  when duplicate_object then null;
end $$;
