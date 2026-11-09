---
name: verify-meal-reactions
description: Model-check meal reactions (favorite vs never-again, pending ballot keys). Use when changing meal_dislikes, saved_meals, block_meal_on_never_again, strip_blocked_saved_keys, or sendMealDislike / sendMealFavorite.
---

# Verify meal reactions

You are checking **thumbs up / Never again** for one household `recipe_key`. The bot must not suggest a banned meal as a favorite or on a pending ballot.

Read every TLA+ result with the pstack `/statechart` skill, by that name. Do not copy its commands or paths from memory; they change between releases.

## Does this change touch the verified code?

In scope if the diff includes any of:

| File | Functions |
| --- | --- |
| `supabase/migrations/20261007020000_meal_reactions.sql` | `private.block_meal_on_never_again`, `private.clear_never_again_for_favorite`, `private.strip_blocked_saved_keys`, `saved_meal_pool`, `meal_avoidance` |
| `src/lib/meal-reactions.ts` | `applyFavoriteAction`, `applyDislikeAction` |
| `src/lib/meal-dislikes.ts` | `dislikeSendAction`, `clearNeverAgain` |
| `src/lib/saved-meals.ts` | `favoriteSendAction` |
| `src/lib/supabase/repo.ts` | `supabaseUpsertMealDislike`, `supabaseAllowMealAgain`, `supabaseUpsertFavorite` |
| `src/components/supper-provider.tsx` | `sendMealFavorite`, `sendMealDislike` |

If none of those changed, stop. If they changed after the **sync commit** below, the model may be stale.

## Run

```bash
verification/meal-reactions/check.sh
```

Java 21+; the script pins TLA+ tools 1.8.0. Must finish in well under a minute.

```bash
verification/meal-reactions/check.sh broken         # skip block_meal_on_never_again — must FAIL
verification/meal-reactions/check.sh broken-ballot  # skip strip_blocked_saved_keys — must FAIL
```

Read TLC with `/statechart`. Spec: `verification/meal-reactions/MealReactions.tla`. Config: `verification/meal-reactions/MealReactions.cfg`.

## Properties (plain words)

1. **Never again and Favorite cannot both be on for the same recipe_key.** Harm: the bot puts a banned meal back on the ballot as a favorite.
2. **A pending ballot does not carry a Never-again key.** Harm: next week's ballot proposes a meal the house banned.

Each of `BlockNeverAgain` and `FavoriteMeal` includes its SQL trigger in the **same** action (same transaction as the upsert). Do not split the trigger into a later step unless the code does.

## Real bug vs modeling error

- **Fingerprint fail:** the trigger body no longer deletes `saved_meals` or clears `never_again`. Intended? Update the spec.
- **TLC fail:** two devices last-writer-wins is in scope; after each committed write the invariant must hold. If you model the client extra `saved_meals.delete` after dislike as a **second** action, you invented a gap the DB trigger already closed — that is a modeling error.
- Favorite-then-never-again (or reverse) on two phones: last writer wins; both triggers restore the mutex. If TLC finds both true, the trigger is missing.

## Update the model for an intended change

1. Keep one action per upsert+trigger.
2. If Never again should keep the favorite, `NeverAgainExcludesFavorite` will fail — that is a product change; do not weaken the sentence, change the product copy first.
3. Run `verification/meal-reactions/check.sh` and `check.sh broken`.
4. Move the sync commit only after the spec matches this commit.

## Coverage record

- **Spec:** `verification/meal-reactions/MealReactions.tla`
- **Config:** `verification/meal-reactions/MealReactions.cfg`
- **Bounds:** 2 recipe keys, boolean favorite/never-again, pending ballot ⊆ keys. 25 distinct states on the last check.
- **Not covered:** like-only notes (`meal_likes`); `requested_for_week` targeting the planning week; eater vs voter RLS; `recipe_key` title-normalization mismatches.
- **Sync commit:** `4bf1d1cd658887e35f541cd382eb4393a4a9eb53`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
