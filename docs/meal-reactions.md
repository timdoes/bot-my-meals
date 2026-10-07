# Favorites and Never again

One Supabase project for every house. Rows are household-scoped. There is no second database.

Favorites are `public.saved_meals` (same `recipe_key` as before). Thumbs-up replaces Save. **Make next week** sets `requested_for_week` to the planning week and bypasses the 21-day cool-down. **Make in ~3 weeks** leaves that column empty. Neither Send wakes the bot or creates a week. See [`docs/saved-meals.md`](saved-meals.md).

## Never again and notes

| Table | Meaning |
| --- | --- |
| `public.meal_dislikes` | One row per household and `recipe_key`. `never_again` blocks that whole meal from future ballots and drops it from Favorites. A note with `never_again` false is part feedback; the meal stays suggestable. |
| `public.meal_likes` | Append-only "What did you like about this meal?" notes. No list in the app. |

A meal cannot be both a favorite and Never again. Like text and dislike text can both exist.

Meal Ops, service role, for one household:

```sql
select recipe_key, title, note
from public.meal_dislikes
where household_id = $household
  and never_again;

select recipe_key, title, note
from public.meal_dislikes
where household_id = $household
  and not never_again
  and btrim(note) <> '';

select recipe_key, title, note, created_at
from public.meal_likes
where household_id = $household
order by created_at desc;
```

`public.meal_avoidance()` returns the same three lists for the signed-in member. Do not invent grocery prices or cart claims from these rows.
