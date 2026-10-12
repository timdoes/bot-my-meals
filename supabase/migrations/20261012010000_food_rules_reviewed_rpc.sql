-- Owner or User can mark food rules as reviewed (including "no allergies or foods to skip").
-- Eater logins and anon cannot. Household comes from the argument; membership is auth.uid()
-- of that same house (never the earliest membership). Does not wake the bot.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.
-- Requires 20261011220000_food_rules.sql (households.food_rules_reviewed_at).

create or replace function public.set_food_rules_reviewed(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  member_role text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_household_id is null then
    raise exception 'not_a_member';
  end if;

  select m.role into member_role
  from public.memberships m
  where m.user_id = uid
    and m.household_id = p_household_id;

  if member_role is null then
    raise exception 'not_a_member';
  end if;
  if member_role not in ('owner', 'voter') then
    raise exception 'Eaters can look, not change food rules.';
  end if;

  update public.households
     set food_rules_reviewed_at = now()
   where id = p_household_id;
end;
$$;

revoke all on function public.set_food_rules_reviewed(uuid) from public, anon;
grant execute on function public.set_food_rules_reviewed(uuid) to authenticated;

comment on function public.set_food_rules_reviewed(uuid) is
  'Sets households.food_rules_reviewed_at. Admin or User of that household only. Does not wake the bot.';
