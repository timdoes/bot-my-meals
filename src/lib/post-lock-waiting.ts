import type { WeekNightPresentation } from "./ballot";
import { POST_LOCK_GET_RECIPES_WAKE_HINT, RECIPE_PENDING_WAKE_HINT } from "./bot-wake";
import type { WeekRole } from "./types";
import {
  BOT_CHECK_WAITING_ADAPTIVE,
  effectiveIntervalHours,
  fixedWaitingCadenceLine,
} from "./bot-check";
import { nightLifecycle } from "./lock";
import type {
  BotCheckIntervalHours,
  BotCheckMode,
  Meal,
  Membership,
  Recipe,
  Vote,
  WeekStatus,
} from "./types";

export const POST_LOCK_WAITING_TITLE = "Waiting for your Bot";
export const POST_LOCK_WAITING_BODY =
  "Recipes and your shopping list show up after your Bot My Meals bot runs.";
export const POST_LOCK_GET_RECIPES_LABEL = "Get recipes now";
export const POST_LOCK_GET_RECIPES_HINT =
  "Message your Bot My Meals Grok Bot and ask it to fill recipes and the shopping list for this week. This isn\u2019t a push from the app.";
export const POST_LOCK_BOT_CHECK_SETTINGS = "Bot check settings";
export const POST_LOCK_WAKE_SETTINGS = "Wake your Bot";
export const POST_LOCK_BOT_NOTIFIED =
  "Your bot was notified. Recipes and your list will show up here.";

export const RECIPE_PENDING_TITLE = "Waiting for your Bot";
export const RECIPE_PENDING_BODY = "Your bot hasn\u2019t saved this recipe yet.";
export const RECIPE_PENDING_HINT =
  "Message your Bot My Meals Grok Bot and ask it to fill recipes for this week.";

export const POST_LOCK_GET_RECIPES_NEXT_HINT =
  "Message your Bot My Meals Grok Bot and ask it to fill recipes and the shopping list for next week. This isn\u2019t a push from the app.";
export const POST_LOCK_GET_RECIPES_NEXT_WAKE_HINT =
  "Wakes your bot to fill recipes and the shopping list for next week.";
export const RECIPE_PENDING_NEXT_HINT =
  "Message your Bot My Meals Grok Bot and ask it to fill recipes for next week.";
export const RECIPE_PENDING_NEXT_WAKE_HINT = "Wakes your bot to fill this recipe for next week.";

export function getRecipesHint(role: WeekRole, wake: boolean): string {
  switch (role) {
    case "cooking":
      return wake ? POST_LOCK_GET_RECIPES_WAKE_HINT : POST_LOCK_GET_RECIPES_HINT;
    case "planning":
      return wake ? POST_LOCK_GET_RECIPES_NEXT_WAKE_HINT : POST_LOCK_GET_RECIPES_NEXT_HINT;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function recipePendingHint(role: WeekRole, wake: boolean): string {
  switch (role) {
    case "cooking":
      return wake ? RECIPE_PENDING_WAKE_HINT : RECIPE_PENDING_HINT;
    case "planning":
      return wake ? RECIPE_PENDING_NEXT_WAKE_HINT : RECIPE_PENDING_NEXT_HINT;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export type PendingBotFillInput = {
  weekStatus: WeekStatus;
  meals: ReadonlyArray<Pick<Meal, "id" | "title">>;
  votes: Vote[];
  memberships: Membership[];
  recipes: Recipe[];
  shoppingList: { items: readonly unknown[] } | null;
};

export type LockedDinnerTap = "none" | "waiting" | "recipe" | "review";

const MINUTE_MS = 60_000;

function recipeForMeal(recipes: Recipe[], mealId: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.mealId === mealId);
}

/** Title plus at least one step — enough for See recipes to open a real recipe. */
export function dinnerRecipeReady(meal: Pick<Meal, "id" | "title">, recipes: Recipe[]): boolean {
  if (!meal.title.trim()) return false;
  const recipe = recipeForMeal(recipes, meal.id);
  if (!recipe) return false;
  return recipe.steps.some((step) => step.trim().length > 0);
}

function isLockedDinner(
  meal: Pick<Meal, "id" | "title">,
  votes: Vote[],
  memberships: Membership[],
): boolean {
  const lifecycle = nightLifecycle(meal, votes, memberships);
  switch (lifecycle) {
    case "passive":
    case "proposed":
    case "swapped":
      return meal.title.trim().length > 0;
    case "removed":
    case "request_new_meal":
      return false;
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

function dinnersNeedGroceries(
  dinners: ReadonlyArray<Pick<Meal, "id">>,
  recipes: Recipe[],
): boolean {
  return dinners.some((meal) => (recipeForMeal(recipes, meal.id)?.ingredients.length ?? 0) > 0);
}

/**
 * List is ready when it has items, or when every locked dinner already has a
 * recipe and none of those recipes need groceries (nothing to buy).
 */
export function shoppingListReadyForLock(
  shoppingList: { items: readonly unknown[] } | null,
  dinners: ReadonlyArray<Pick<Meal, "id">>,
  recipes: Recipe[],
  recipesReady: boolean,
): boolean {
  if ((shoppingList?.items.length ?? 0) > 0) return true;
  return recipesReady && !dinnersNeedGroceries(dinners, recipes);
}

/** Locked week, and the bot has not written the list and every dinner recipe yet. */
export function isPendingBotFill(input: PendingBotFillInput): boolean {
  if (input.weekStatus !== "locked") return false;
  const dinners = input.meals.filter((meal) => isLockedDinner(meal, input.votes, input.memberships));
  const recipesReady = dinners.every((meal) => dinnerRecipeReady(meal, input.recipes));
  const listReady = shoppingListReadyForLock(input.shoppingList, dinners, input.recipes, recipesReady);
  return !recipesReady || !listReady;
}

/** Deep link while the week is still waiting and this night has no recipe body. */
export function nightShowsRecipePending(input: PendingBotFillInput & { mealId: string }): boolean {
  if (!isPendingBotFill(input)) return false;
  const meal = input.meals.find((item) => item.id === input.mealId);
  if (!meal || !isLockedDinner(meal, input.votes, input.memberships)) return false;
  return !dinnerRecipeReady(meal, input.recipes);
}

export function lockedDinnerTap(input: {
  locked: boolean;
  pending: boolean;
  presentation: WeekNightPresentation;
  /** House-local past night. Opens the meal for review and does not open the waiting sheet. */
  past?: boolean;
}): LockedDinnerTap {
  if (input.past && input.presentation === "ballot") return "review";
  if (!input.locked || input.presentation !== "ballot") return "none";
  return input.pending ? "waiting" : "recipe";
}

/** Minutes until the next check. Null when there is no last-check time. */
export function nextCheckMinutes(
  lastCheckedAt: string | null | undefined,
  intervalHours: BotCheckIntervalHours,
  now: Date,
): number | null {
  if (!lastCheckedAt) return null;
  const last = Date.parse(lastCheckedAt);
  if (!Number.isFinite(last)) return null;
  const elapsed = now.getTime() - last;
  if (elapsed < 0) return null;
  const intervalMs = intervalHours * 60 * MINUTE_MS;
  const intoCycle = elapsed % intervalMs;
  const remainingMs = intoCycle === 0 ? intervalMs : intervalMs - intoCycle;
  return Math.max(1, Math.ceil(remainingMs / MINUTE_MS));
}

export function postLockWaitingIntervalHours(
  mode: BotCheckMode,
  intervalHours: BotCheckIntervalHours | null,
): BotCheckIntervalHours {
  return effectiveIntervalHours({
    mode,
    intervalHours,
    phase: "active",
  });
}

/**
 * Adaptive pending is about every hour. A countdown needs the last check.
 * With only the interval, return the cadence line and skip a precise clock.
 */
export function postLockWaitingCadenceLine(input: {
  mode: BotCheckMode;
  intervalHours: BotCheckIntervalHours | null;
  lastCheckedAt?: string | null;
  now?: Date;
}): string {
  const hours = postLockWaitingIntervalHours(input.mode, input.intervalHours);
  const minutes = nextCheckMinutes(input.lastCheckedAt, hours, input.now ?? new Date());
  if (minutes == null) {
    switch (input.mode) {
      case "adaptive":
        return BOT_CHECK_WAITING_ADAPTIVE;
      case "fixed":
        return fixedWaitingCadenceLine(hours);
      default: {
        const _exhaustive: never = input.mode;
        return _exhaustive;
      }
    }
  }
  const countdown = `Next check in about ${minutes} min.`;
  switch (input.mode) {
    case "adaptive":
      return countdown;
    case "fixed":
      return `${countdown} · ${fixedWaitingCadenceLine(hours)}`;
    default: {
      const _exhaustive: never = input.mode;
      return _exhaustive;
    }
  }
}
