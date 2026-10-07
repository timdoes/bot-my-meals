import { clearNeverAgain } from "./meal-dislikes";
import type { DislikeAction } from "./meal-dislikes";
import type { FavoriteAction } from "./saved-meals";
import type { HouseholdSnapshot, MealDislike, SavedMeal } from "./types";

/**
 * Thumbs-up with the switch on clears Never again for that meal.
 * Like-only and remove leave dislike rows alone. Nights and shopping stay put.
 */
export function applyFavoriteAction(
  snapshot: HouseholdSnapshot,
  action: FavoriteAction,
  meal: SavedMeal,
): HouseholdSnapshot {
  let savedMeals: SavedMeal[];
  switch (action) {
    case "next":
    case "cooldown":
      savedMeals = [meal, ...snapshot.savedMeals.filter((row) => row.recipeKey !== meal.recipeKey)];
      break;
    case "like":
    case "remove":
      savedMeals = snapshot.savedMeals.filter((row) => row.recipeKey !== meal.recipeKey);
      break;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }

  const mealDislikes =
    action === "next" || action === "cooldown"
      ? clearNeverAgain(snapshot.mealDislikes, meal.recipeKey)
      : snapshot.mealDislikes;

  return { ...snapshot, savedMeals, mealDislikes };
}

/** Never again on drops the favorite. Part feedback does not. The night is not cleared. */
export function applyDislikeAction(
  snapshot: HouseholdSnapshot,
  action: DislikeAction,
  row: MealDislike,
): HouseholdSnapshot {
  let mealDislikes: MealDislike[];
  switch (action) {
    case "block":
      mealDislikes = [{ ...row, neverAgain: true }, ...snapshot.mealDislikes.filter((item) => item.recipeKey !== row.recipeKey)];
      break;
    case "feedback":
      mealDislikes = [
        { ...row, neverAgain: false },
        ...snapshot.mealDislikes.filter((item) => item.recipeKey !== row.recipeKey),
      ];
      break;
    case "allow":
      mealDislikes = row.note.trim()
        ? snapshot.mealDislikes.map((item) =>
            item.recipeKey === row.recipeKey ? { ...row, neverAgain: false } : item,
          )
        : snapshot.mealDislikes.filter((item) => item.recipeKey !== row.recipeKey);
      break;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }

  const savedMeals =
    action === "block"
      ? snapshot.savedMeals.filter((meal) => meal.recipeKey !== row.recipeKey)
      : snapshot.savedMeals;

  return { ...snapshot, mealDislikes, savedMeals };
}
