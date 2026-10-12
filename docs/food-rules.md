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
