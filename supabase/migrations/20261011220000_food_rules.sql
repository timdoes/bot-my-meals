-- Food rules, part 1 of 3: people without a login, per-person food rules, allergen vocabulary.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.
-- Household scoped: every row carries household_id; subjects are bound by composite foreign
-- keys, so a rule can never point at another household's person. No bot wake from any of this.
-- Additive and idempotent. Safe for old app code (nothing existing is altered except two
-- unique indexes that composite foreign keys need).

-- Targets for composite (household_id, id) foreign keys.
create unique index if not exists memberships_household_id_id_key
  on public.memberships (household_id, id);
create unique index if not exists weeks_household_id_id_key
  on public.weeks (household_id, id);

alter table public.households
  add column if not exists food_rules_reviewed_at timestamptz;

comment on column public.households.food_rules_reviewed_at is
  'null = never asked about food rules. Set with zero rules = "no allergies or foods to skip".';

-- People at the table without a sign-in (a child, someone who lives here). Names only.
-- They do not vote, have no role, no token, no invite, no access.
create table if not exists public.household_eaters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 40),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index if not exists household_eaters_name_key
  on public.household_eaters (household_id, lower(btrim(display_name)));

create table if not exists public.food_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- both null = whole house; at most one set
  subject_membership_id uuid,
  subject_eater_id uuid,
  food_label text not null check (char_length(btrim(food_label)) between 1 and 60),
  food_key text not null check (char_length(food_key) between 1 and 60),
  allergen_code text
    check (allergen_code is null or allergen_code in
      ('milk','eggs','fish','shellfish','tree_nuts','peanuts','wheat','soy','sesame')),
  severity text not null check (severity in ('allergy', 'intolerance', 'dislike')),
  details text not null default '' check (char_length(details) <= 200),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (subject_membership_id is not null and subject_eater_id is not null)),
  foreign key (household_id, subject_membership_id)
    references public.memberships (household_id, id) on delete cascade,
  foreign key (household_id, subject_eater_id)
    references public.household_eaters (household_id, id) on delete cascade,
  unique (household_id, id)
);

create unique index if not exists food_rules_subject_food_key
  on public.food_rules (
    household_id,
    coalesce(subject_membership_id, subject_eater_id, household_id),
    food_key
  );
create index if not exists food_rules_household_severity_idx
  on public.food_rules (household_id, severity);

-- Global reference data. No household data. Read-only for signed-in users.
create table if not exists public.allergen_terms (
  allergen_code text not null
    check (allergen_code in
      ('milk','eggs','fish','shellfish','tree_nuts','peanuts','wheat','soy','sesame')),
  term text not null check (term = lower(term) and char_length(term) between 1 and 60),
  primary key (allergen_code, term)
);

-- Phrases that contain an allergen word but are not that allergen ("peanut butter" is not milk).
create table if not exists public.allergen_exclusions (
  allergen_code text not null
    check (allergen_code in
      ('milk','eggs','fish','shellfish','tree_nuts','peanuts','wheat','soy','sesame')),
  phrase text not null check (phrase = lower(phrase) and char_length(phrase) between 1 and 60),
  primary key (allergen_code, phrase)
);

-- ---------------------------------------------------------------------------
-- Triggers: normalize, guard, cap.
-- ---------------------------------------------------------------------------

create or replace function private.norm_text(input text)
returns text
language sql
immutable
set search_path = public
as $$
  -- lowercase, strip common accents and punctuation, pad with single spaces
  select ' ' || btrim(regexp_replace(
    translate(lower(coalesce(input, '')),
      'àáâãäåèéêëìíîïòóôõöùúûüçñ',
      'aaaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g')) || ' ';
$$;

revoke all on function private.norm_text(text) from public, anon;
grant execute on function private.norm_text(text) to authenticated;

create or replace function private.food_rules_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.household_id is distinct from old.household_id then
    raise exception 'A food rule cannot move to another household.';
  end if;
  new.food_label := btrim(regexp_replace(new.food_label, '\s+', ' ', 'g'));
  new.food_key := lower(new.food_label);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.food_rules_before_write() from public, anon;

drop trigger if exists food_rules_before_write on public.food_rules;
create trigger food_rules_before_write
  before insert or update on public.food_rules
  for each row execute function private.food_rules_before_write();

create or replace function private.household_eaters_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  if tg_op = 'UPDATE' and new.household_id is distinct from old.household_id then
    raise exception 'A person cannot move to another household.';
  end if;
  new.display_name := btrim(new.display_name);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    select count(*) into n from public.household_eaters where household_id = new.household_id;
    if n >= 12 then
      raise exception 'A household can list up to 12 people without a sign-in.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.household_eaters_before_write() from public, anon;

drop trigger if exists household_eaters_before_write on public.household_eaters;
create trigger household_eaters_before_write
  before insert or update on public.household_eaters
  for each row execute function private.household_eaters_before_write();

-- ---------------------------------------------------------------------------
-- RLS. Read: any household member (Eater logins included).
-- Write: owner (Admin) or voter (User) of that same household.
-- ---------------------------------------------------------------------------

alter table public.household_eaters enable row level security;
alter table public.food_rules enable row level security;
alter table public.allergen_terms enable row level security;
alter table public.allergen_exclusions enable row level security;

drop policy if exists household_eaters_member_read on public.household_eaters;
create policy household_eaters_member_read on public.household_eaters
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists household_eaters_writer_insert on public.household_eaters;
create policy household_eaters_writer_insert on public.household_eaters
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = household_eaters.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists household_eaters_writer_update on public.household_eaters;
create policy household_eaters_writer_update on public.household_eaters
  for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = household_eaters.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = household_eaters.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists household_eaters_writer_delete on public.household_eaters;
create policy household_eaters_writer_delete on public.household_eaters
  for delete to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = household_eaters.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists food_rules_member_read on public.food_rules;
create policy food_rules_member_read on public.food_rules
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists food_rules_writer_insert on public.food_rules;
create policy food_rules_writer_insert on public.food_rules
  for insert to authenticated
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = food_rules.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists food_rules_writer_update on public.food_rules;
create policy food_rules_writer_update on public.food_rules
  for update to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = food_rules.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.household_id = food_rules.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists food_rules_writer_delete on public.food_rules;
create policy food_rules_writer_delete on public.food_rules
  for delete to authenticated
  using (
    exists (
      select 1 from public.memberships m
      where m.household_id = food_rules.household_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'voter')
    )
  );

drop policy if exists allergen_terms_read on public.allergen_terms;
create policy allergen_terms_read on public.allergen_terms
  for select to authenticated using (true);

drop policy if exists allergen_exclusions_read on public.allergen_exclusions;
create policy allergen_exclusions_read on public.allergen_exclusions
  for select to authenticated using (true);

revoke all on public.household_eaters, public.food_rules,
  public.allergen_terms, public.allergen_exclusions from anon, authenticated, public;
grant select, insert, update, delete on public.household_eaters to authenticated;
grant select, insert, update, delete on public.food_rules to authenticated;
grant select on public.allergen_terms to authenticated;
grant select on public.allergen_exclusions to authenticated;
grant all on public.household_eaters, public.food_rules,
  public.allergen_terms, public.allergen_exclusions to service_role;

-- ---------------------------------------------------------------------------
-- Allergen vocabulary v1 (US major nine). Conservative: a net, not a guarantee.
-- New terms ship by migration only.
-- ---------------------------------------------------------------------------

insert into public.allergen_terms (allergen_code, term)
select v.code, v.term
from (values
  ('milk','milk'),('milk','cream'),('milk','half and half'),('milk','butter'),('milk','buttermilk'),
  ('milk','ghee'),('milk','cheese'),('milk','cheddar'),('milk','mozzarella'),('milk','parmesan'),
  ('milk','parmigiano'),('milk','pecorino'),('milk','ricotta'),('milk','mascarpone'),('milk','feta'),
  ('milk','gouda'),('milk','swiss'),('milk','provolone'),('milk','brie'),('milk','cream cheese'),
  ('milk','cottage cheese'),('milk','queso'),('milk','paneer'),('milk','yogurt'),('milk','yoghurt'),
  ('milk','kefir'),('milk','whey'),('milk','casein'),('milk','caseinate'),('milk','lactose'),
  ('milk','custard'),('milk','ice cream'),('milk','gelato'),('milk','sour cream'),
  ('milk','creme fraiche'),('milk','alfredo'),('milk','bechamel'),('milk','curd'),
  ('milk','evaporated milk'),('milk','condensed milk'),
  ('eggs','egg'),('eggs','egg white'),('eggs','egg yolk'),('eggs','yolk'),('eggs','albumen'),
  ('eggs','mayonnaise'),('eggs','mayo'),('eggs','aioli'),('eggs','meringue'),('eggs','custard'),
  ('eggs','hollandaise'),('eggs','bearnaise'),('eggs','frittata'),('eggs','quiche'),
  ('eggs','omelet'),('eggs','omelette'),('eggs','brioche'),('eggs','lysozyme'),
  ('eggs','ovalbumin'),('eggs','eggnog'),
  ('fish','fish'),('fish','salmon'),('fish','tuna'),('fish','cod'),('fish','halibut'),
  ('fish','tilapia'),('fish','trout'),('fish','bass'),('fish','snapper'),('fish','haddock'),
  ('fish','mahi'),('fish','mahi mahi'),('fish','swordfish'),('fish','anchovy'),
  ('fish','anchovies'),('fish','sardine'),('fish','mackerel'),('fish','herring'),
  ('fish','catfish'),('fish','pollock'),('fish','fish sauce'),('fish','worcestershire'),
  ('fish','caesar dressing'),('fish','surimi'),('fish','fish stock'),('fish','dashi'),
  ('fish','bonito'),('fish','roe'),('fish','caviar'),
  ('shellfish','shrimp'),('shellfish','prawn'),('shellfish','crab'),('shellfish','lobster'),
  ('shellfish','crawfish'),('shellfish','crayfish'),('shellfish','scallop'),('shellfish','clam'),
  ('shellfish','mussel'),('shellfish','oyster'),('shellfish','squid'),('shellfish','calamari'),
  ('shellfish','octopus'),('shellfish','shellfish'),('shellfish','langoustine'),
  ('shellfish','krill'),('shellfish','abalone'),('shellfish','snail'),('shellfish','escargot'),
  ('shellfish','seafood'),('shellfish','oyster sauce'),('shellfish','shrimp paste'),
  ('tree_nuts','almond'),('tree_nuts','walnut'),('tree_nuts','pecan'),('tree_nuts','cashew'),
  ('tree_nuts','pistachio'),('tree_nuts','hazelnut'),('tree_nuts','filbert'),
  ('tree_nuts','macadamia'),('tree_nuts','brazil nut'),('tree_nuts','pine nut'),
  ('tree_nuts','chestnut'),('tree_nuts','praline'),('tree_nuts','marzipan'),
  ('tree_nuts','nougat'),('tree_nuts','gianduja'),('tree_nuts','nutella'),
  ('tree_nuts','nut butter'),('tree_nuts','almond milk'),('tree_nuts','almond flour'),
  ('tree_nuts','amaretto'),('tree_nuts','frangelico'),('tree_nuts','tree nut'),('tree_nuts','nut'),
  ('peanuts','peanut'),('peanuts','peanut butter'),('peanuts','groundnut'),('peanuts','goober'),
  ('peanuts','arachis'),('peanuts','satay'),('peanuts','peanut oil'),('peanuts','mixed nuts'),
  ('wheat','wheat'),('wheat','flour'),('wheat','bread'),('wheat','breadcrumb'),
  ('wheat','bread crumb'),('wheat','panko'),('wheat','pasta'),('wheat','noodle'),
  ('wheat','spaghetti'),('wheat','macaroni'),('wheat','penne'),('wheat','couscous'),
  ('wheat','bulgur'),('wheat','farro'),('wheat','semolina'),('wheat','durum'),('wheat','spelt'),
  ('wheat','kamut'),('wheat','seitan'),('wheat','gluten'),('wheat','pita'),('wheat','naan'),
  ('wheat','cracker'),('wheat','croissant'),('wheat','bun'),('wheat','bagel'),
  ('wheat','pizza dough'),('wheat','soy sauce'),('wheat','udon'),('wheat','orzo'),
  ('wheat','cereal'),('wheat','malt'),('wheat','tortilla'),
  ('soy','soy'),('soy','soya'),('soy','soybean'),('soy','edamame'),('soy','tofu'),
  ('soy','tempeh'),('soy','miso'),('soy','natto'),('soy','soy sauce'),('soy','shoyu'),
  ('soy','tamari'),('soy','teriyaki'),('soy','hoisin'),('soy','soy milk'),
  ('soy','soy lecithin'),('soy','textured vegetable protein'),('soy','tvp'),
  ('sesame','sesame'),('sesame','tahini'),('sesame','sesame oil'),('sesame','sesame seed'),
  ('sesame','benne'),('sesame','gomasio'),('sesame','halvah'),('sesame','halva'),
  ('sesame','hummus'),('sesame','zaatar'),('sesame','furikake')
) as v(code, term)
on conflict do nothing;

insert into public.allergen_exclusions (allergen_code, phrase)
select v.code, v.phrase
from (values
  ('milk','peanut butter'),('milk','almond butter'),('milk','nut butter'),('milk','cashew butter'),
  ('milk','sunflower butter'),('milk','cocoa butter'),('milk','shea butter'),
  ('milk','butter bean'),('milk','butter beans'),('milk','butternut'),('milk','coconut milk'),
  ('milk','almond milk'),('milk','oat milk'),('milk','rice milk'),('milk','soy milk'),
  ('milk','coconut cream'),('milk','cream of tartar'),('milk','coconut yogurt'),
  ('milk','dairy free'),('milk','non dairy'),
  ('wheat','rice noodle'),('wheat','rice noodles'),('wheat','rice flour'),
  ('wheat','almond flour'),('wheat','coconut flour'),('wheat','corn tortilla'),
  ('wheat','corn tortillas'),('wheat','gluten free'),('wheat','buckwheat noodle'),
  ('wheat','chickpea flour'),
  ('tree_nuts','water chestnut'),('tree_nuts','water chestnuts'),('tree_nuts','peanut'),
  ('tree_nuts','peanuts'),('tree_nuts','peanut butter'),('tree_nuts','mixed nuts'),
  ('tree_nuts','nutmeg'),
  ('soy','soy free')
) as v(code, phrase)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Realtime (read only; clients refresh their own household through RLS).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['household_eaters', 'food_rules'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

comment on table public.household_eaters is
  'People at the table with no sign-in (names only). No role, no vote, no access.';
comment on table public.food_rules is
  'Per-person (or whole-house) allergies, intolerances and foods to never suggest. Household scoped.';
