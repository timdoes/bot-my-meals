import { weekdayLabelFromNight } from "./dates";
import { isNightOff, nightLifecycle } from "./lock";
import { recipeNightsForWeek } from "./recipes";
import type { Meal, Membership, ShoppingPrompt, Vote, WeekStatus } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseShoppingPrompt(value: unknown): ShoppingPrompt {
  switch (value) {
    case "done":
    case "dismissed":
    case "open":
      return value;
    default:
      return "open";
  }
}

export function parseEditableFrom(value: unknown): string | null {
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}

export function shoppingPromptClosed(prompt: ShoppingPrompt): boolean {
  switch (prompt) {
    case "done":
    case "dismissed":
      return true;
    case "open":
      return false;
    default: {
      const _exhaustive: never = prompt;
      return _exhaustive;
    }
  }
}

/** Fully locked weeks lock every night. After unlock, only nights before `editableFrom` stay locked. */
export function nightStaysLocked(input: {
  weekStatus: WeekStatus;
  nightDate: string;
  editableFrom: string | null;
}): boolean {
  switch (input.weekStatus) {
    case "locked":
      return true;
    case "voting": {
      const from = input.editableFrom;
      return from != null && input.nightDate < from;
    }
    default: {
      const _exhaustive: never = input.weekStatus;
      return _exhaustive;
    }
  }
}

/** A strip night is selectable only when it still has a dinner. Removed, blank, and pending nights stay visible but inert. */
export function nightHasStripMeal(
  meal: Pick<Meal, "id" | "title">,
  votes: Vote[],
  memberships?: Membership[],
): boolean {
  const lifecycle = nightLifecycle(meal, votes, memberships);
  switch (lifecycle) {
    case "passive":
    case "swapped":
    case "proposed":
      return true;
    case "removed":
    case "request_new_meal":
      return false;
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

/** Past strip cells are muted in every cooking week, locked or not. */
export function stripCellMuted(input: {
  nightDate: string;
  todayIso: string;
}): boolean {
  return input.nightDate < input.todayIso;
}

export function showOpenShoppingList(input: {
  weekStatus: WeekStatus;
  shoppingPrompt: ShoppingPrompt;
  pendingFill: boolean;
  items: readonly { checked: boolean }[] | null;
}): boolean {
  if (input.pendingFill) return false;
  if (input.weekStatus !== "locked") return false;
  if (shoppingPromptClosed(input.shoppingPrompt)) return false;
  const items = input.items;
  if (!items || items.length === 0) return false;
  if (items.every((item) => item.checked)) return false;
  return true;
}

/** Today or later, with a title, and not removed. Advances once that night's date is past in the house timezone. */
export function upcomingDinner(meals: readonly Meal[], votes: Vote[], todayIso: string): Meal | undefined {
  return recipeNightsForWeek([...meals]).find((meal) => {
    if (meal.nightDate < todayIso) return false;
    if (!meal.title.trim()) return false;
    if (isNightOff(meal.id, votes)) return false;
    return true;
  });
}

export function showFirstMealRow(input: {
  weekStatus: WeekStatus;
  pendingFill: boolean;
  meal: Meal | undefined;
}): boolean {
  if (input.pendingFill) return false;
  if (input.weekStatus !== "locked") return false;
  return Boolean(input.meal?.title.trim());
}

/**
 * Featured blue-card eyebrow on /week. `todayIso` is the household calendar
 * date (`todayInTimeZone`). The featured night is that meal's `nightDate`.
 */
export function featuredMealEyebrow(nightDate: string, todayIso: string): string {
  if (nightDate === todayIso) return "Tonight’s meal";
  return `${weekdayLabelFromNight(nightDate)}’s meal`;
}

/** Exact labels on a past dinner card. */
export const MADE_CHIP_LABEL = "Made";
export const NOT_PLANNED_CHIP_LABEL = "Not planned";
export const NO_RECIPE_CHIP_LABEL = "No recipe";

export const LOCK_THIS_WEEK_LABEL = "Lock this week";
export const LOCK_REST_OF_WEEK_LABEL = "Lock the rest of this week";
export const LOCK_BUSY_LABEL = "Locking…";

export type BallotNightChip = "made" | "not_planned" | "no_recipe";

export function parsePlannedFrom(value: unknown): string | null {
  return parseEditableFrom(value);
}

/**
 * A night is covered when the first lock included it.
 * Null `plannedFrom` on a week that has been locked (or unlocked after a lock)
 * means the whole week is covered — existing rows before this column existed.
 * A never-locked week with null `plannedFrom` covers nothing.
 */
export function nightCoveredByLock(input: {
  nightDate: string;
  plannedFrom: string | null;
  weekStatus: WeekStatus;
  editableFrom: string | null;
}): boolean {
  if (input.plannedFrom != null) return input.nightDate >= input.plannedFrom;
  switch (input.weekStatus) {
    case "locked":
      return true;
    case "voting":
      return input.editableFrom != null;
    default: {
      const _exhaustive: never = input.weekStatus;
      return _exhaustive;
    }
  }
}

export function cookingNightChip(input: {
  past: boolean;
  covered: boolean;
  recipeReady: boolean;
  off: boolean;
}): BallotNightChip | null {
  if (!input.past) return null;
  if (!input.covered) return "not_planned";
  if (input.off) return null;
  return input.recipeReady ? "made" : "no_recipe";
}

export function lockBarLabel(input: { busy: boolean; hasPastNight: boolean }): string {
  if (input.busy) return LOCK_BUSY_LABEL;
  return input.hasPastNight ? LOCK_REST_OF_WEEK_LABEL : LOCK_THIS_WEEK_LABEL;
}

export function lockBarSubline(input: { dinnerCount: number; hasPastNight: boolean }): string {
  const n = input.dinnerCount;
  if (!input.hasPastNight) {
    return n === 1 ? "Locks 1 dinner." : `Locks ${n} dinners.`;
  }
  return n === 1 ? "Locks 1 dinner from today on." : `Locks ${n} dinners from today on.`;
}

export function lockDinnerCount(
  meals: readonly Meal[],
  votes: Vote[],
  memberships: Membership[] | undefined,
  todayIso: string,
): number {
  return meals.filter((meal) => {
    if (meal.nightDate < todayIso) return false;
    if (!meal.title.trim()) return false;
    return !isNightOff(meal.id, votes, memberships);
  }).length;
}

export function weekHasPastNight(meals: readonly Meal[], todayIso: string): boolean {
  return meals.some((meal) => meal.nightDate < todayIso);
}

export function notPlannedAriaLabel(weekday: string): string {
  return `${weekday}, not planned`;
}

export type MealNightPhase = "past" | "today" | "future";

/**
 * A dinner night is past once that house-local calendar day has ended.
 * `todayIso` is `todayInTimeZone` for the household. Today and later nights are not past.
 */
export function mealNightPhase(nightDate: string, todayIso: string): MealNightPhase {
  if (nightDate < todayIso) return "past";
  if (nightDate === todayIso) return "today";
  return "future";
}

export function isPastDinnerNight(nightDate: string, todayIso: string): boolean {
  return mealNightPhase(nightDate, todayIso) === "past";
}

/** Past cooking nights stay review-only, locked or unlocked. Today and future follow the week lock. */
export function dinnerNightActionsOpen(input: {
  past: boolean;
  nightLocked: boolean;
  canAct: boolean;
}): boolean {
  if (input.past) return false;
  if (input.nightLocked) return false;
  return input.canAct;
}
