# Food rules (data and bot read)

Allergies, intolerances, and foods to never suggest, per person, plus who is eating each night.
Household scoped by Row Level Security and composite foreign keys. One database, no database per house.
Editing a rule or who is eating **never wakes the bot**.

## Tables (migrations `20261011220000` to `20261011222000`)

| Table | What it holds |
|---|---|
| `household_eaters` | People at the table with no sign-in (a child). Name only. No role, no vote, no access. Up to 12 per house. |
| `food_rules` | One row per food. `severity` is `allergy`, `intolerance`, or `dislike`. Subject is a member, a named person, or neither (Whole house). |
| `week_night_lists` | A row means that night has a named list: plates = people listed + `guests`. No row = Everyone and the free plate count. |
| `week_night_attendees` | The people on a named-list night (member or named person). Writes only through `save_week_people_v2` / `save_planning_people_v2`. |
| `recipe_food_holds` | An Allergy match on a written recipe. Held until a User or Admin taps "I've checked" (`ack_recipe_food_hold`). Past weeks are never held. |
| `allergen_terms`, `allergen_exclusions` | Global word lists for the nine major allergens. No household data. Terms ship by migration. |
| `households.food_rules_reviewed_at` | null = never asked. |

Permissions: any member reads. Admin (`owner`) and User (`voter`) write. Eater logins are read-only.

## Server checks (a net, not a guarantee)

- A meal write (title or pitch) is rejected with `food_rule_conflict: <food>` when an Allergy rule in scope for that night matches the title or pitch. Intolerance and Dislike rules match the title only.
- "In scope" = Whole-house rules plus the rules of the people eating that night (Everyone nights: every person).
- Recipes written after lock are held when an ingredient or the title matches an Allergy in scope.
- A named person (or member) who is the only person on a named-list night cannot be removed; the night would silently fall back to Everyone.

## Bot read

`public.food_rules_for_bot(p_household_id uuid default null, p_week_id uuid default null)` with the household member token the bot already uses. Security invoker: RLS scopes it. A login in more than one house must pass `p_household_id` (otherwise `household_required`). It returns `{household_id, reviewed, people[], rules[], nights[]}`; each night has `plates`, `attendees`, `attendees_custom`, `guests`, `unnamed_plates`, and the `rules` in scope for that night. No emails or user ids.

Bot routine text for "Wake on app event" is in this file's section "Bot routine text" in the plan and is pasted by the owner of the shared bot; DIY households paste it into their own bot.

## Eight-step setup (deploy order)

House setup becomes 8 steps (invite, size, nights, plates, **food**, stores, budget, create-meals) with `setup_step` 8 = Create meals and 9 = done. The app **does not** switch to that numbering just because this Worker shipped.

The snapshot flag `houseSetupEightStep` (`isHouseSetupEightStepLive()`) is on only when **both** are true:

1. Food-rules tables exist (`isFoodRulesSchemaReady()` — the five tables in `FOOD_RULES_SNAPSHOT_TABLES` read without a missing-schema error).
2. `public.setup_eight_step_ready()` returns true. That function (migration `20261012030000_setup_eight_step_ready`) is `SECURITY DEFINER` and reads the remap marker `private.migration_markers.key = 'setup_step_nine_remap'` written by `20261011224500_setup_step_nine_remap`. Signed-in users cannot read the marker table. A missing function (`PGRST202` / `42883`) or a false return keeps 7-step numbering. The app never infers remap from a stored `setup_step`.

A database without the food-rules migrations, or with the tables but **without** remap, keeps today's 7-step flow exactly: last = 7, done = 8, label `Setup · step N of 7`. Mid-setup houses at old 5/6/7 stay on Stores / Budget / Create meals.

**Required order on every database (DIY and btve):**

1. Apply `20261011220000` … `20261011222000` (tables / RLS / bot read). Old app code stays correct.
2. Apply `20261011223000_setup_step_nine_expand` (check 1–9, default 9, `request_week_ballot` writes 9). No row change. Old app treats 9 as done.
3. Apply **file 8** `20261012030000_setup_eight_step_ready` **before the remap**. The function exists and returns false until the marker row is written. A Worker that already shipped stays on 7-step.
4. Count in-progress houses (`setup_step` between 1 and 7) if you need a quiet window.
5. Apply `20261011224500_setup_step_nine_remap` **immediately before** this 8-step app deploys on that database. After this, `setup_eight_step_ready()` is true.
6. Deploy every app that shares the database in the same window.

Rollback of the Worker only (keep the remapped DB): old code treats 9 as done. Reverse remap is hand-written SQL (`setup_step - 1` where 6–9), not a migration file.
