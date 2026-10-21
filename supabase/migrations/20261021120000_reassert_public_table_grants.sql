-- Re-assert public Data API table grants (idempotent).
--
-- After 2026-10-30, new tables in public are not granted to anon / authenticated /
-- service_role (new DIY projects, preview branches, `supabase db reset`). Creating
-- migrations now GRANT at create time. This file repeats those GRANTs so a database
-- that already applied the older files still reaches the same end state without
-- replaying history. Safe to re-run. No RLS, function-body, or table-shape changes.
--
-- anon: not granted on any public table. RLS policies are `to authenticated` only;
-- signed-out clients use peek_join_token (security definer). The old default ALL
-- grant to anon was unused.
-- Sequences: none (uuid defaults). Views: none.

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
  public.shopping_items,
  public.household_invites,
  public.household_join_tokens,
  public.ballot_requests,
  public.saved_meals,
  public.meal_dislikes,
  public.household_eaters,
  public.food_rules
  to authenticated;

grant select, insert on public.meal_likes to authenticated;

grant select on table
  public.meal_history_weeks,
  public.meal_history_nights,
  public.allergen_terms,
  public.allergen_exclusions,
  public.week_night_lists,
  public.week_night_attendees,
  public.recipe_food_holds
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
  public.shopping_items,
  public.household_invites,
  public.household_join_tokens,
  public.ballot_requests,
  public.meal_history_weeks,
  public.meal_history_nights,
  public.saved_meals,
  public.meal_dislikes,
  public.meal_likes,
  public.household_eaters,
  public.food_rules,
  public.allergen_terms,
  public.allergen_exclusions,
  public.week_night_lists,
  public.week_night_attendees,
  public.recipe_food_holds
  to service_role;
