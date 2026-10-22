import { formatMealCardDayLabel } from "./dates";
import { isNightOff } from "./lock";
import { recipeNightsForWeek } from "./recipes";
import { nightCoveredByLock } from "./week-chrome";
import type { Meal, Membership, Vote, Week } from "./types";

/** NAV-TABS lock §2 / HOUSE-SETTINGS-SPLIT §4 strings. */
export const ALL_RECIPES_LABEL = "All recipes";
export const ALL_RECIPES_TITLE = "All recipes";
export const PREVIOUS_NIGHT_LABEL = "Previous night";
export const NEXT_NIGHT_LABEL = "Next night";
export const RECIPE_BACK_LABEL = "Meals";

/** Nights you can step between on a recipe page: in day order, nights off and uncovered past nights skipped. */
export function steppableNights(
  meals: Meal[],
  votes: Vote[],
  memberships?: Membership[],
  week?: Pick<Week, "status" | "plannedFrom" | "editableFrom">,
): Meal[] {
  return recipeNightsForWeek(meals).filter((meal) => {
    if (isNightOff(meal.id, votes, memberships)) return false;
    if (
      week &&
      !nightCoveredByLock({
        nightDate: meal.nightDate,
        plannedFrom: week.plannedFrom,
        weekStatus: week.status,
        editableFrom: week.editableFrom,
      })
    ) {
      return false;
    }
    return true;
  });
}

/** Previous / next cooking night for the recipe arrows. Null at the week's ends (arrow disabled). */
export function adjacentNights(
  meals: Meal[],
  votes: Vote[],
  mealId: string,
  memberships?: Membership[],
  week?: Pick<Week, "status" | "plannedFrom" | "editableFrom">,
): { previous: Meal | null; next: Meal | null } {
  const nights = steppableNights(meals, votes, memberships, week);
  const at = nights.findIndex((meal) => meal.id === mealId);
  if (at < 0) {
    // A night that is off: step to the nearest cooking nights around it.
    const self = meals.find((meal) => meal.id === mealId);
    if (!self) return { previous: null, next: null };
    const before = nights.filter((meal) => meal.nightDate < self.nightDate);
    const after = nights.filter((meal) => meal.nightDate > self.nightDate);
    return { previous: before.at(-1) ?? null, next: after[0] ?? null };
  }
  return { previous: nights[at - 1] ?? null, next: nights[at + 1] ?? null };
}

/** `Tonight · Sun Oct 11` or `Mon · Oct 12`. */
export function recipeEyebrow(nightDate: string, todayIso: string): string {
  const label = formatMealCardDayLabel(nightDate);
  if (nightDate !== todayIso) return label;
  return `Tonight · ${label.replace(" · ", " ")}`;
}

/** `Next: Mon · Black bean tacos`. */
export function recipeNextLine(next: Meal | null): string | null {
  if (!next) return null;
  const weekday = formatMealCardDayLabel(next.nightDate).split(" · ")[0];
  return `Next: ${weekday} · ${next.title}`;
}
