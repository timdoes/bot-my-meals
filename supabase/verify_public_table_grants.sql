-- Count-only. Expect missing_auth = 0, missing_service = 0, extra_anon = 0.
-- extra_anon counts public tables where anon still has SELECT (should be 0 on a
-- post-Oct-30 reset; leftover default ALL on an older project is possible).
with expected_auth(table_name, priv) as (
  values
    ('profiles', 'select'), ('profiles', 'insert'), ('profiles', 'update'), ('profiles', 'delete'),
    ('households', 'select'), ('households', 'insert'), ('households', 'update'), ('households', 'delete'),
    ('memberships', 'select'), ('memberships', 'insert'), ('memberships', 'update'), ('memberships', 'delete'),
    ('household_stores', 'select'), ('household_stores', 'insert'), ('household_stores', 'update'), ('household_stores', 'delete'),
    ('weeks', 'select'), ('weeks', 'insert'), ('weeks', 'update'), ('weeks', 'delete'),
    ('meals', 'select'), ('meals', 'insert'), ('meals', 'update'), ('meals', 'delete'),
    ('votes', 'select'), ('votes', 'insert'), ('votes', 'update'), ('votes', 'delete'),
    ('recipes', 'select'), ('recipes', 'insert'), ('recipes', 'update'), ('recipes', 'delete'),
    ('recipe_ingredients', 'select'), ('recipe_ingredients', 'insert'), ('recipe_ingredients', 'update'), ('recipe_ingredients', 'delete'),
    ('shopping_lists', 'select'), ('shopping_lists', 'insert'), ('shopping_lists', 'update'), ('shopping_lists', 'delete'),
    ('shopping_items', 'select'), ('shopping_items', 'insert'), ('shopping_items', 'update'), ('shopping_items', 'delete'),
    ('household_invites', 'select'), ('household_invites', 'insert'), ('household_invites', 'update'), ('household_invites', 'delete'),
    ('household_join_tokens', 'select'), ('household_join_tokens', 'insert'), ('household_join_tokens', 'update'), ('household_join_tokens', 'delete'),
    ('ballot_requests', 'select'), ('ballot_requests', 'insert'), ('ballot_requests', 'update'), ('ballot_requests', 'delete'),
    ('saved_meals', 'select'), ('saved_meals', 'insert'), ('saved_meals', 'update'), ('saved_meals', 'delete'),
    ('meal_dislikes', 'select'), ('meal_dislikes', 'insert'), ('meal_dislikes', 'update'), ('meal_dislikes', 'delete'),
    ('household_eaters', 'select'), ('household_eaters', 'insert'), ('household_eaters', 'update'), ('household_eaters', 'delete'),
    ('food_rules', 'select'), ('food_rules', 'insert'), ('food_rules', 'update'), ('food_rules', 'delete'),
    ('meal_likes', 'select'), ('meal_likes', 'insert'),
    ('meal_history_weeks', 'select'),
    ('meal_history_nights', 'select'),
    ('allergen_terms', 'select'),
    ('allergen_exclusions', 'select'),
    ('week_night_lists', 'select'),
    ('week_night_attendees', 'select'),
    ('recipe_food_holds', 'select')
)
select
  (select count(*) from expected_auth e
    where not has_table_privilege('authenticated', format('public.%I', e.table_name), e.priv)) as missing_auth,
  (select count(*) from expected_auth e
    where not has_table_privilege('service_role', format('public.%I', e.table_name), e.priv)) as missing_service,
  (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
      and has_table_privilege('anon', c.oid, 'select')) as extra_anon,
  (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')) as public_relations;
