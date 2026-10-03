import { nightLifecycle } from "./lock";
import { recipeNightsForWeek } from "./recipes";
import { nightStaysLocked } from "./week-chrome";
import type {
  HouseholdSnapshot,
  Meal,
  Membership,
  NightLifecycle,
  Recipe,
  Vote,
  WeekStatus,
} from "./types";

export const MOVE_EARLIER_LABEL = "Move earlier";
export const MOVE_LATER_LABEL = "Move later";

export function reorderGripLabel(title: string): string {
  return `Reorder ${title}`;
}

/** Screen reader line after two meals trade nights. */
export function mealReorderAnnouncement(input: {
  mealTitle: string;
  weekday: string;
  otherMealTitle: string;
  otherWeekday: string;
}): string {
  return `Moved ${input.mealTitle} to ${input.weekday}. ${input.otherMealTitle} is now ${input.otherWeekday}.`;
}

export type MealReorderContext = {
  viewingPast: boolean;
  weekStatus: WeekStatus;
  editableFrom: string | null;
  todayIso: string;
};

/**
 * A dinner card can move only on the unlocked viewed week, today or later
 * in the house timezone. Past nights, off nights, and a locked week cannot.
 */
export function mealReorderAllowed(input: MealReorderContext & {
  nightDate: string;
  lifecycle: NightLifecycle;
  title: string;
}): boolean {
  if (input.viewingPast) return false;
  if (!input.title.trim()) return false;
  if (input.nightDate < input.todayIso) return false;
  if (
    nightStaysLocked({
      weekStatus: input.weekStatus,
      nightDate: input.nightDate,
      editableFrom: input.editableFrom,
    })
  ) {
    return false;
  }
  switch (input.lifecycle) {
    case "passive":
    case "swapped":
    case "proposed":
      return true;
    case "removed":
    case "request_new_meal":
      return false;
    default: {
      const _exhaustive: never = input.lifecycle;
      return _exhaustive;
    }
  }
}

export function orderedMovableMealIds(
  meals: readonly Meal[],
  votes: readonly Vote[],
  memberships: readonly Membership[] | undefined,
  context: MealReorderContext,
): string[] {
  return recipeNightsForWeek([...meals])
    .filter((meal) =>
      mealReorderAllowed({
        ...context,
        nightDate: meal.nightDate,
        lifecycle: nightLifecycle(meal, [...votes], memberships ? [...memberships] : undefined),
        title: meal.title,
      }),
    )
    .map((meal) => meal.id);
}

export type MealReorderControlState = {
  canMoveEarlier: boolean;
  canMoveLater: boolean;
};

/** Null hides the grip and both chevrons. Disabled directions stay visible. */
export function mealReorderControls(input: {
  mealId: string;
  canAct: boolean;
  allowed: boolean;
  movableIds: readonly string[];
}): MealReorderControlState | null {
  if (!input.canAct || !input.allowed) return null;
  const index = input.movableIds.indexOf(input.mealId);
  if (index < 0) return null;
  return {
    canMoveEarlier: index > 0,
    canMoveLater: index < input.movableIds.length - 1,
  };
}

export function mealReorderDropAllowed(
  sourceId: string,
  targetId: string | null | undefined,
  movableIds: readonly string[],
): boolean {
  if (!targetId || targetId === sourceId) return false;
  return movableIds.includes(sourceId) && movableIds.includes(targetId);
}

function remapMealPointer(id: string | null, sourceId: string, targetId: string): string | null {
  if (id === sourceId) return targetId;
  if (id === targetId) return sourceId;
  return id;
}

function withIncomingMeal(slot: Meal, incoming: Meal, sourceId: string, targetId: string): Meal {
  return {
    ...slot,
    title: incoming.title,
    pitch: incoming.pitch,
    prepMinutes: incoming.prepMinutes,
    isLeftovers: incoming.isLeftovers,
    leftoverOfMealId: remapMealPointer(incoming.leftoverOfMealId, sourceId, targetId),
  };
}

function swapRecipeBodies(recipes: Recipe[], source: Meal, target: Meal): Recipe[] {
  const sourceRecipe = recipes.find((recipe) => recipe.mealId === source.id);
  const targetRecipe = recipes.find((recipe) => recipe.mealId === target.id);
  if (sourceRecipe && targetRecipe) {
    return recipes.map((recipe) => {
      if (recipe.id === sourceRecipe.id) {
        return {
          ...recipe,
          steps: targetRecipe.steps,
          ingredients: targetRecipe.ingredients,
          prepMinutes: targetRecipe.prepMinutes,
          cookMinutes: targetRecipe.cookMinutes,
          recipeKey: targetRecipe.recipeKey,
          servings: sourceRecipe.servings,
        };
      }
      if (recipe.id === targetRecipe.id) {
        return {
          ...recipe,
          steps: sourceRecipe.steps,
          ingredients: sourceRecipe.ingredients,
          prepMinutes: sourceRecipe.prepMinutes,
          cookMinutes: sourceRecipe.cookMinutes,
          recipeKey: sourceRecipe.recipeKey,
          servings: targetRecipe.servings,
        };
      }
      return recipe;
    });
  }
  const only = sourceRecipe ?? targetRecipe;
  if (!only) return recipes;
  const destination = sourceRecipe ? target : source;
  return recipes.map((recipe) =>
    recipe.id === only.id
      ? { ...recipe, mealId: destination.id, servings: destination.servings }
      : recipe,
  );
}

/**
 * Trade meal title, pitch, and recipe body between two slots in one week.
 * Each slot keeps its servings, audience, night, and the week's headcounts.
 */
export function swapMealContent(
  snapshot: HouseholdSnapshot,
  sourceId: string,
  targetId: string,
): HouseholdSnapshot {
  if (!sourceId || !targetId || sourceId === targetId) return snapshot;
  const planning = snapshot.planning;
  const located = [snapshot.meals, planning?.meals].find(
    (meals) => meals?.some((meal) => meal.id === sourceId) && meals.some((meal) => meal.id === targetId),
  );
  if (!located) return snapshot;
  const source = located.find((meal) => meal.id === sourceId);
  const target = located.find((meal) => meal.id === targetId);
  if (!source || !target || source.weekId !== target.weekId) return snapshot;

  const meals = located.map((meal) => {
    if (meal.id === source.id) return withIncomingMeal(source, target, source.id, target.id);
    if (meal.id === target.id) return withIncomingMeal(target, source, source.id, target.id);
    return meal;
  });
  const recipes = swapRecipeBodies(
    source.weekId === snapshot.week.id ? snapshot.recipes : (planning?.recipes ?? []),
    source,
    target,
  );

  if (source.weekId === snapshot.week.id) {
    return { ...snapshot, meals, recipes };
  }
  if (!planning || planning.week.id !== source.weekId) return snapshot;
  return {
    ...snapshot,
    planning: { ...planning, meals, recipes },
  };
}
