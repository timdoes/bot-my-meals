create extension if not exists pgcrypto;

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  week_starts_on smallint not null default 0 check (week_starts_on between 0 and 6),
  couple_nights smallint[] not null default '{5,6}',
  family_size integer not null default 4 check (family_size > 0),
  couple_size integer not null default 2 check (couple_size > 0),
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'voter', 'eater')),
  display_name text not null,
  email text,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.household_stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order integer not null default 0,
  unique (household_id, slug)
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  starts_on date not null,
  status text not null default 'voting' check (status in ('voting', 'locked')),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, starts_on)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null references public.weeks (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 6),
  night_date date not null,
  title text not null,
  pitch text not null default '',
  audience text not null check (audience in ('couple', 'family')),
  servings integer not null,
  prep_minutes integer not null default 30,
  is_leftovers boolean not null default false,
  leftover_of_meal_id uuid references public.meals (id) on delete set null,
  estimated_cost_cents integer,
  estimated_cost_source text,
  estimated_cost_as_of date,
  created_at timestamptz not null default now(),
  unique (week_id, day_index),
  check (
    (estimated_cost_cents is null and estimated_cost_source is null and estimated_cost_as_of is null)
    or (estimated_cost_cents is not null and estimated_cost_source is not null and estimated_cost_as_of is not null)
  )
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meal_id uuid not null references public.meals (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  choice text not null check (choice in ('approve', 'swap', 'skip')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_id, membership_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meal_id uuid not null unique references public.meals (id) on delete cascade,
  servings integer not null,
  prep_minutes integer not null default 0,
  cook_minutes integer not null default 0,
  steps jsonb not null default '[]'::jsonb
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  name text not null,
  quantity numeric not null,
  unit text not null default '',
  store_id uuid not null references public.household_stores (id) on delete restrict
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  week_id uuid not null unique references public.weeks (id) on delete cascade,
  generated_at timestamptz not null default now()
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  shopping_list_id uuid not null references public.shopping_lists (id) on delete cascade,
  store_id uuid not null references public.household_stores (id) on delete restrict,
  name text not null,
  quantity numeric not null,
  unit text not null default '',
  price_cents integer,
  price_source text,
  priced_at date,
  checked boolean not null default false,
  check (
    (price_cents is null and price_source is null and priced_at is null)
    or (price_cents is not null and price_source is not null and priced_at is not null)
  )
);

create or replace function private.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.memberships where user_id = auth.uid();
$$;

revoke all on function private.user_household_ids() from public;
grant execute on function private.user_household_ids() to authenticated;

create or replace function public.is_household_member(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select target in (select private.user_household_ids());
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Neighbor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function private.week_start(week_starts_on integer, from_date date default current_date)
returns date
language sql
immutable
as $$
  select from_date - ((extract(dow from from_date)::int - week_starts_on + 7) % 7);
$$;

create or replace function private.enforce_week_lock()
returns trigger
language plpgsql
as $$
declare
  missing integer;
begin
  if new.status = 'locked' and old.status is distinct from 'locked' then
    select count(*) into missing
    from public.meals m
    cross join public.memberships mem
    where m.week_id = new.id
      and mem.household_id = new.household_id
      and mem.role in ('owner', 'voter')
      and not exists (
        select 1
        from public.votes v
        where v.meal_id = m.id
          and v.membership_id = mem.id
          and v.choice in ('approve', 'skip')
      );
    if missing > 0 then
      raise exception 'Week cannot lock until every voter has approved or skipped every night';
    end if;
    new.locked_at = coalesce(new.locked_at, now());
  end if;
  if new.status = 'voting' then
    new.locked_at = null;
  end if;
  return new;
end;
$$;

create trigger weeks_lock_guard
  before update on public.weeks
  for each row execute function private.enforce_week_lock();

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
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.households (name)
  values (nullif(trim(household_name), ''))
  returning id into hid;

  insert into public.memberships (household_id, user_id, role, display_name, email)
  select hid, uid, 'owner', p.display_name, p.email
  from public.profiles p
  where p.id = uid;

  insert into public.household_stores (household_id, name, slug, sort_order)
  values
    (hid, 'Trader Joe''s', 'trader-joes', 0),
    (hid, 'Smith''s', 'smiths', 1);

  starts := private.week_start(0, current_date);
  insert into public.weeks (household_id, starts_on, status)
  values (hid, starts, 'voting');

  return hid;
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

  insert into public.memberships (household_id, user_id, role, display_name, email)
  select hid, uid, 'voter', p.display_name, p.email
  from public.profiles p
  where p.id = uid
  on conflict (household_id, user_id) do nothing;

  return hid;
end;
$$;

create or replace function public.lock_current_week()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  wid uuid;
  lid uuid;
begin
  select household_id into hid
  from public.memberships
  where user_id = auth.uid()
  limit 1;

  if hid is null then
    raise exception 'Not in a household';
  end if;

  select id into wid
  from public.weeks
  where household_id = hid
  order by starts_on desc
  limit 1;

  update public.weeks
  set status = 'locked'
  where id = wid;

  delete from public.shopping_lists where week_id = wid;

  insert into public.shopping_lists (household_id, week_id)
  values (hid, wid)
  returning id into lid;

  insert into public.shopping_items (
    household_id, shopping_list_id, store_id, name, quantity, unit
  )
  select
    hid,
    lid,
    ri.store_id,
    ri.name,
    sum(ri.quantity),
    ri.unit
  from public.meals m
  join public.recipes r on r.meal_id = m.id
  join public.recipe_ingredients ri on ri.recipe_id = r.id
  where m.week_id = wid
    and not exists (
      select 1 from public.votes v
      where v.meal_id = m.id and v.choice = 'skip'
    )
  group by ri.store_id, lower(btrim(ri.name)), ri.unit, ri.name;

  return lid;
end;
$$;

create or replace function public.seed_demo_week()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  role text;
  wid uuid;
  starts date;
  store_tj uuid;
  store_sm uuid;
  meal_ids uuid[] := '{}';
  rec_id uuid;
  i int;
  titles text[] := array[
    'Lemon roast chicken',
    'Chicken tostadas',
    'Mandarin orange chicken',
    'Sheet-pan sausage and peppers',
    'Spaghetti and meat sauce',
    'Pan-seared salmon',
    'Steak tacos for two'
  ];
  pitches text[] := array[
    'One chicken, potatoes, and green beans. Monday will thank you.',
    'Sunday''s roast, crisped tortillas, salsa, and a little cheese.',
    'The Trader Joe''s bag everyone actually wants, plus rice and broccoli.',
    'Sausage, peppers, onions, and potatoes on one pan.',
    'A pot of sauce, a box of pasta, a green salad. Thursday solved.',
    'Two fillets, asparagus, lemon. Date-night energy on a Friday.',
    'A small skillet of steak, onions, and tortillas. No leftovers on purpose.'
  ];
begin
  select m.household_id, m.role into hid, role
  from public.memberships m
  where m.user_id = auth.uid()
  limit 1;

  if hid is null or role <> 'owner' then
    raise exception 'Only a household owner can seed the week';
  end if;

  select id into store_tj from public.household_stores where household_id = hid and slug = 'trader-joes';
  select id into store_sm from public.household_stores where household_id = hid and slug = 'smiths';
  if store_tj is null or store_sm is null then
    raise exception 'Household needs Trader Joe''s and Smith''s stores';
  end if;

  select week_starts_on into i from public.households where id = hid;
  starts := private.week_start(i, current_date);

  delete from public.weeks where household_id = hid and starts_on = starts;

  insert into public.weeks (household_id, starts_on, status)
  values (hid, starts, 'voting')
  returning id into wid;

  for i in 0..6 loop
    insert into public.meals (
      household_id, week_id, day_index, night_date, title, pitch, audience, servings, prep_minutes, is_leftovers
    )
    values (
      hid,
      wid,
      i,
      starts + i,
      titles[i + 1],
      pitches[i + 1],
      case when extract(dow from starts + i)::int in (5, 6) then 'couple' else 'family' end,
      case when extract(dow from starts + i)::int in (5, 6) then 2 else 4 end,
      case i
        when 0 then 80
        when 1 then 20
        when 2 then 25
        when 3 then 40
        when 4 then 35
        else 25
      end,
      i = 1
    )
    returning id into rec_id;
    meal_ids := meal_ids || rec_id;
  end loop;

  update public.meals
  set leftover_of_meal_id = meal_ids[1]
  where id = meal_ids[2];

  -- Sunday roast
  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[1], 4, 15, 65, '[
    "Heat the oven to 425°F.",
    "Pat the chicken dry. Rub with olive oil, salt, pepper, and smashed garlic.",
    "Stuff the cavity with lemon halves. Scatter potatoes around the pan.",
    "Roast 60–70 minutes, until the thigh reads 165°F.",
    "In the last 15 minutes, toss green beans with oil and roast on a second sheet.",
    "Rest the chicken 10 minutes. Save leftover meat for Monday."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Whole chicken', 1, 'ct', store_sm),
    (hid, rec_id, 'Yukon gold potatoes', 2, 'lb', store_sm),
    (hid, rec_id, 'Green beans', 1, 'lb', store_sm),
    (hid, rec_id, 'Lemons', 2, 'ct', store_tj),
    (hid, rec_id, 'Garlic', 1, 'head', store_tj),
    (hid, rec_id, 'Olive oil', 3, 'tbsp', store_tj);

  -- Monday leftovers extras
  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[2], 4, 10, 10, '[
    "Shred leftover chicken and warm it with a spoon of salsa.",
    "Crisp tortillas in a dry skillet or the oven.",
    "Pile on chicken, cheese, lettuce, and more salsa."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Corn tortillas', 8, 'ct', store_tj),
    (hid, rec_id, 'Salsa', 1, 'jar', store_tj),
    (hid, rec_id, 'Shredded Mexican cheese', 6, 'oz', store_tj),
    (hid, rec_id, 'Romaine lettuce', 1, 'head', store_sm);

  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[3], 4, 5, 20, '[
    "Cook rice.",
    "Bake the orange chicken according to the bag.",
    "Steam or roast broccoli until just tender."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Mandarin orange chicken', 2, 'bags', store_tj),
    (hid, rec_id, 'Jasmine rice', 2, 'cups', store_tj),
    (hid, rec_id, 'Broccoli crowns', 2, 'ct', store_sm);

  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[4], 4, 10, 30, '[
    "Heat the oven to 425°F.",
    "Toss sliced potatoes, peppers, and onions with oil and salt.",
    "Nestle sausages on the sheet and roast 25–30 minutes."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Italian sausage', 2, 'lb', store_sm),
    (hid, rec_id, 'Bell peppers', 3, 'ct', store_sm),
    (hid, rec_id, 'Yellow onions', 2, 'ct', store_sm),
    (hid, rec_id, 'Baby potatoes', 1.5, 'lb', store_sm),
    (hid, rec_id, 'Olive oil', 2, 'tbsp', store_tj);

  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[5], 4, 10, 25, '[
    "Brown the beef with chopped onion and garlic.",
    "Stir in the jarred sauce and simmer 15 minutes.",
    "Boil spaghetti in salted water until al dente."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Ground beef', 1.5, 'lb', store_sm),
    (hid, rec_id, 'Spaghetti', 1, 'lb', store_tj),
    (hid, rec_id, 'Marinara sauce', 1, 'jar', store_tj),
    (hid, rec_id, 'Yellow onion', 1, 'ct', store_sm),
    (hid, rec_id, 'Mixed salad greens', 1, 'bag', store_tj);

  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[6], 2, 10, 15, '[
    "Pat salmon dry and season with salt and pepper.",
    "Sear skin-side down in a hot skillet 4 minutes, then flip for 2–3.",
    "Roast asparagus at 425°F with oil and salt, about 12 minutes."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Salmon fillets', 2, 'ct', store_sm),
    (hid, rec_id, 'Asparagus', 1, 'bunch', store_sm),
    (hid, rec_id, 'Lemon', 1, 'ct', store_tj),
    (hid, rec_id, 'Olive oil', 2, 'tbsp', store_tj);

  insert into public.recipes (household_id, meal_id, servings, prep_minutes, cook_minutes, steps)
  values (hid, meal_ids[7], 2, 10, 20, '[
    "Slice steak thin against the grain. Season well.",
    "Sear in a very hot skillet in batches so it browns.",
    "Cook onions in the same pan until soft.",
    "Warm tortillas and serve with salsa and cilantro."
  ]'::jsonb)
  returning id into rec_id;
  insert into public.recipe_ingredients (household_id, recipe_id, name, quantity, unit, store_id) values
    (hid, rec_id, 'Flank steak', 0.75, 'lb', store_sm),
    (hid, rec_id, 'Flour tortillas', 6, 'ct', store_tj),
    (hid, rec_id, 'Yellow onion', 1, 'ct', store_sm),
    (hid, rec_id, 'Salsa', 1, 'jar', store_tj),
    (hid, rec_id, 'Cilantro', 1, 'bunch', store_sm);

  return wid;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.household_stores enable row level security;
alter table public.weeks enable row level security;
alter table public.meals enable row level security;
alter table public.votes enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;

create policy profiles_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy households_member_read on public.households
  for select to authenticated using (public.is_household_member(id));
create policy households_owner_update on public.households
  for update to authenticated
  using (id in (
    select household_id from public.memberships where user_id = auth.uid() and role = 'owner'
  ));

create policy memberships_read on public.memberships
  for select to authenticated using (public.is_household_member(household_id));

create policy stores_read on public.household_stores
  for select to authenticated using (public.is_household_member(household_id));
create policy stores_owner_write on public.household_stores
  for all to authenticated
  using (household_id in (
    select household_id from public.memberships where user_id = auth.uid() and role = 'owner'
  ))
  with check (household_id in (
    select household_id from public.memberships where user_id = auth.uid() and role = 'owner'
  ));

create policy weeks_read on public.weeks
  for select to authenticated using (public.is_household_member(household_id));
create policy weeks_member_update on public.weeks
  for update to authenticated using (public.is_household_member(household_id));

create policy meals_read on public.meals
  for select to authenticated using (public.is_household_member(household_id));
create policy meals_member_write on public.meals
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy votes_read on public.votes
  for select to authenticated using (public.is_household_member(household_id));
create policy votes_own_write on public.votes
  for all to authenticated
  using (
    membership_id in (select id from public.memberships where user_id = auth.uid())
  )
  with check (
    membership_id in (select id from public.memberships where user_id = auth.uid())
    and public.is_household_member(household_id)
  );

create policy recipes_locked_read on public.recipes
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.meals m
      join public.weeks w on w.id = m.week_id
      where m.id = recipes.meal_id and w.status = 'locked'
    )
  );
create policy recipes_member_insert on public.recipes
  for insert to authenticated
  with check (public.is_household_member(household_id));
create policy recipes_member_update on public.recipes
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy recipes_member_delete on public.recipes
  for delete to authenticated
  using (public.is_household_member(household_id));

create policy ingredients_locked_read on public.recipe_ingredients
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.recipes r
      join public.meals m on m.id = r.meal_id
      join public.weeks w on w.id = m.week_id
      where r.id = recipe_ingredients.recipe_id and w.status = 'locked'
    )
  );
create policy ingredients_member_insert on public.recipe_ingredients
  for insert to authenticated
  with check (public.is_household_member(household_id));
create policy ingredients_member_update on public.recipe_ingredients
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
create policy ingredients_member_delete on public.recipe_ingredients
  for delete to authenticated
  using (public.is_household_member(household_id));

create policy lists_locked_read on public.shopping_lists
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (select 1 from public.weeks w where w.id = week_id and w.status = 'locked')
  );

create policy items_locked_read on public.shopping_items
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.shopping_lists sl
      join public.weeks w on w.id = sl.week_id
      where sl.id = shopping_list_id and w.status = 'locked'
    )
  );
create policy items_member_update on public.shopping_items
  for update to authenticated
  using (public.is_household_member(household_id));

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
grant execute on function public.lock_current_week() to authenticated;
grant execute on function public.seed_demo_week() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.meals;
alter publication supabase_realtime add table public.weeks;
alter publication supabase_realtime add table public.shopping_items;

-- Data API table grants. After 2026-10-30, new public tables no longer receive
-- automatic grants to anon / authenticated / service_role.
-- anon: not granted. Every RLS policy here is `to authenticated`; the old default
-- ALL grant was unused (RLS denied anon anyway). peek_join_token is the signed-out path.
grant select, insert, update, delete on table
  public.profiles,
  public.households,
  public.memberships,
  public.household_stores,
  public.weeks,
  public.meals,
  public.votes,
  public.recipes,
  public.recipe_ingredients,
  public.shopping_lists,
  public.shopping_items
  to authenticated;
grant all on table
  public.profiles,
  public.households,
  public.memberships,
  public.household_stores,
  public.weeks,
  public.meals,
  public.votes,
  public.recipes,
  public.recipe_ingredients,
  public.shopping_lists,
  public.shopping_items
  to service_role;
