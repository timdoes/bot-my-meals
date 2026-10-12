-- recipes: let household members read their own household's recipes in any week status.
-- Cause: supabaseProposeReplacement does insert(...).select("id") (INSERT ... RETURNING).
-- RETURNING rows must also pass a SELECT policy, and the only one, recipes_locked_read,
-- requires the meal's week to be 'locked'. Editing a meal in a voting/planning week therefore
-- passes recipes_member_insert's WITH CHECK but fails on RETURNING -> 403 (42501).
-- The prior delete().eq("meal_id") is also silently a no-op for the same reason.
-- recipe_ingredients already has unconditional member read, so this exposes nothing new.
-- No function changes; is_household_member keeps authenticated-only EXECUTE. Idempotent.

drop policy if exists recipes_member_read on public.recipes;
create policy recipes_member_read on public.recipes
  for select to authenticated
  using (public.is_household_member(household_id));

-- Defensive: helper EXECUTE stays authenticated-only (no-op if already so).
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
revoke all on function private.user_household_ids() from public, anon;
grant execute on function private.user_household_ids() to authenticated;
