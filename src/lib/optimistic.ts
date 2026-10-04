import { voteNotePersists, voteSavesDinnerPeople } from "@/lib/ballot";
import { scaleIngredientQuantity } from "@/lib/shopping";
import { audienceFromHeadcount, dinnerRequestPeople, withDerivedNightSettings, withNightServings } from "@/lib/headcount";
import { nightsPlannedFromHeadcounts } from "@/lib/house-setup";
import type {
  HouseholdSettingsPatch,
  HouseholdSnapshot,
  Meal,
  MealProposalInput,
  Recipe,
  Role,
  SavedMeal,
  ShoppingPrompt,
  Vote,
  VoteChoice,
  Week,
} from "@/lib/types";

/** Temp ids for a store row the server has not inserted yet. */
export const OPTIMISTIC_STORE_PREFIX = "optimistic-store-";

/** Instant-feedback lock: short revert copy for a list check that fails to save. */
export const LIST_CHECK_SAVE_ERROR = "Couldn\u2019t save \u2014 try again.";

export type OptimisticPatch<T> = (value: T) => T;

export type PendingOptimistic<T> = {
  id: number;
  key: string;
  apply: OptimisticPatch<T>;
};

/** Latest patch for a key wins. Older patches for that key are dropped. */
export function queueOptimistic<T>(
  pending: readonly PendingOptimistic<T>[],
  key: string,
  id: number,
  apply: OptimisticPatch<T>,
): PendingOptimistic<T>[] {
  return [...pending.filter((patch) => patch.key !== key), { id, key, apply }];
}

export function dropOptimistic<T>(
  pending: readonly PendingOptimistic<T>[],
  id: number,
): PendingOptimistic<T>[] {
  return pending.filter((patch) => patch.id !== id);
}

export function applyOptimistic<T>(base: T, pending: readonly PendingOptimistic<T>[]): T {
  return pending.reduce((value, patch) => patch.apply(value), base);
}

export function patchShoppingPrompt(
  snapshot: HouseholdSnapshot,
  shoppingPrompt: ShoppingPrompt,
  weekId?: string,
): HouseholdSnapshot {
  if (weekId && snapshot.planning?.week.id === weekId) {
    return {
      ...snapshot,
      planning: {
        ...snapshot.planning,
        week: { ...snapshot.planning.week, shoppingPrompt },
      },
    };
  }
  return {
    ...snapshot,
    week: { ...snapshot.week, shoppingPrompt },
  };
}

function withCheckedItems(
  list: HouseholdSnapshot["shoppingList"],
  itemId: string,
  checked: boolean,
): HouseholdSnapshot["shoppingList"] {
  if (!list) return list;
  return {
    ...list,
    items: list.items.map((item) => (item.id === itemId ? { ...item, checked } : item)),
  };
}

export function patchItemChecked(
  snapshot: HouseholdSnapshot,
  itemId: string,
  checked: boolean,
): HouseholdSnapshot {
  const planningList = snapshot.planning?.shoppingList;
  if (planningList?.items.some((item) => item.id === itemId) && snapshot.planning) {
    return {
      ...snapshot,
      planning: {
        ...snapshot.planning,
        shoppingList: withCheckedItems(planningList, itemId, checked),
      },
    };
  }
  return {
    ...snapshot,
    shoppingList: withCheckedItems(snapshot.shoppingList, itemId, checked),
  };
}

function nextVotes(
  votes: Vote[],
  input: {
    mealId: string;
    membershipId: string;
    householdId: string;
    choice: VoteChoice;
    note: string;
  },
): Vote[] {
  const note = voteNotePersists(input.choice) ? input.note : "";
  const updatedAt = new Date().toISOString();
  const existing = votes.find(
    (vote) => vote.mealId === input.mealId && vote.membershipId === input.membershipId,
  );
  const nextVote: Vote = existing
    ? { ...existing, choice: input.choice, note, updatedAt }
    : {
        id: `optimistic-vote-${input.mealId}-${input.membershipId}`,
        householdId: input.householdId,
        mealId: input.mealId,
        membershipId: input.membershipId,
        choice: input.choice,
        note,
        updatedAt,
      };
  return existing
    ? votes.map((vote) => (vote.id === existing.id ? nextVote : vote))
    : [...votes, nextVote];
}

function applyNightPeople(
  snapshot: HouseholdSnapshot,
  mealId: string,
  servings: number,
): HouseholdSnapshot {
  const people = dinnerRequestPeople(servings);
  const audience = audienceFromHeadcount(people);
  const patchScope = (meals: Meal[], recipes: Recipe[], week: Week) => {
    const meal = meals.find((item) => item.id === mealId);
    return {
      meals: meals.map((item) =>
        item.id === mealId ? { ...item, servings: people, audience } : item,
      ),
      recipes: recipes.map((recipe) => {
        if (recipe.mealId !== mealId) return recipe;
        return {
          ...recipe,
          servings: people,
          ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
            quantity: scaleIngredientQuantity(ingredient.quantity, recipe.servings, people),
          })),
        };
      }),
      week:
        meal && week.nightHeadcounts
          ? {
              ...week,
              nightHeadcounts:
                withNightServings(week.nightHeadcounts, meal.nightDate, people) ?? week.nightHeadcounts,
            }
          : week,
    };
  };

  if (snapshot.planning?.meals.some((meal) => meal.id === mealId)) {
    const next = patchScope(snapshot.planning.meals, snapshot.planning.recipes, snapshot.planning.week);
    return {
      ...snapshot,
      planning: { ...snapshot.planning, ...next },
    };
  }
  const next = patchScope(snapshot.meals, snapshot.recipes, snapshot.week);
  return { ...snapshot, ...next };
}

export function patchVote(
  snapshot: HouseholdSnapshot,
  input: {
    mealId: string;
    membershipId: string;
    householdId: string;
    choice: VoteChoice;
    note: string;
    servings?: number;
  },
): HouseholdSnapshot {
  const planning = snapshot.planning;
  const voted =
    planning && planning.meals.some((meal) => meal.id === input.mealId)
      ? {
          ...snapshot,
          planning: {
            ...planning,
            votes: nextVotes(planning.votes, input),
          },
        }
      : { ...snapshot, votes: nextVotes(snapshot.votes, input) };
  if (!voteSavesDinnerPeople(input.choice) || input.servings == null) return voted;
  return applyNightPeople(voted, input.mealId, input.servings);
}

export function patchHousehold(
  snapshot: HouseholdSnapshot,
  patch: HouseholdSettingsPatch,
): HouseholdSnapshot {
  let household = { ...snapshot.household };
  if (patch.name !== undefined) household = { ...household, name: patch.name };
  if (patch.weekStartsOn !== undefined) household = { ...household, weekStartsOn: patch.weekStartsOn };
  if (patch.familySize !== undefined) household = { ...household, familySize: patch.familySize };
  if (patch.coupleSize !== undefined) household = { ...household, coupleSize: patch.coupleSize };
  if (patch.setupStep !== undefined) household = { ...household, setupStep: patch.setupStep };
  if (patch.weeklyBudgetCents !== undefined) {
    household = { ...household, weeklyBudgetCents: patch.weeklyBudgetCents };
  }
  if (patch.householdSize !== undefined) household = { ...household, householdSize: patch.householdSize };
  if (patch.nightsPlanned !== undefined) household = { ...household, nightsPlanned: patch.nightsPlanned };
  if (patch.postalCode !== undefined) household = { ...household, postalCode: patch.postalCode };
  if (patch.botCheckMode !== undefined) household = { ...household, botCheckMode: patch.botCheckMode };
  if (patch.botCheckIntervalHours !== undefined) {
    household = { ...household, botCheckIntervalHours: patch.botCheckIntervalHours };
  }
  if (patch.coupleNights !== undefined && patch.nightHeadcounts === undefined) {
    household = { ...household, coupleNights: patch.coupleNights };
  }

  if (patch.nightHeadcounts !== undefined) {
    household = withDerivedNightSettings(household, patch.nightHeadcounts);
    household = {
      ...household,
      nightsPlanned: nightsPlannedFromHeadcounts(household.nightHeadcounts),
    };
  }

  return { ...snapshot, household };
}

export function patchStoreAdded(
  snapshot: HouseholdSnapshot,
  store: { id: string; name: string; slug: string },
): HouseholdSnapshot {
  if (snapshot.stores.some((item) => item.id === store.id || item.slug === store.slug)) {
    return snapshot;
  }
  const sortOrder = snapshot.stores.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  return {
    ...snapshot,
    stores: [
      ...snapshot.stores,
      {
        id: store.id,
        householdId: snapshot.household.id,
        name: store.name,
        slug: store.slug,
        sortOrder,
      },
    ],
  };
}

export function patchStoreRemoved(snapshot: HouseholdSnapshot, storeId: string): HouseholdSnapshot {
  return {
    ...snapshot,
    stores: snapshot.stores.filter((store) => store.id !== storeId),
  };
}

export function patchMemberRole(
  snapshot: HouseholdSnapshot,
  memberId: string,
  role: Role,
): HouseholdSnapshot {
  return {
    ...snapshot,
    memberships: snapshot.memberships.map((member) =>
      member.id === memberId ? { ...member, role } : member,
    ),
  };
}

export function patchSavedMealAdded(snapshot: HouseholdSnapshot, meal: SavedMeal): HouseholdSnapshot {
  const savedMeals = snapshot.savedMeals.filter((item) => item.recipeKey !== meal.recipeKey);
  return { ...snapshot, savedMeals: [meal, ...savedMeals] };
}

export function patchSavedMealRemoved(snapshot: HouseholdSnapshot, recipeKey: string): HouseholdSnapshot {
  return {
    ...snapshot,
    savedMeals: snapshot.savedMeals.filter((meal) => meal.recipeKey !== recipeKey),
  };
}

export function patchSavedMealRequest(
  snapshot: HouseholdSnapshot,
  recipeKey: string,
  requestedForWeek: string,
): HouseholdSnapshot {
  return {
    ...snapshot,
    savedMeals: snapshot.savedMeals.map((meal) =>
      meal.recipeKey === recipeKey ? { ...meal, requestedForWeek } : meal,
    ),
  };
}

function recipesWithProposal(
  recipes: Recipe[],
  mealId: string,
  proposal: MealProposalInput,
): Recipe[] {
  if (!proposal.ingredients) return recipes;
  const existing = recipes.find((recipe) => recipe.mealId === mealId);
  const next: Recipe = {
    id: existing?.id ?? `optimistic-recipe-${mealId}`,
    mealId,
    servings: proposal.servings ?? existing?.servings ?? 1,
    prepMinutes: existing?.prepMinutes ?? Math.min(15, proposal.prepMinutes),
    cookMinutes: existing?.cookMinutes ?? Math.max(0, proposal.prepMinutes - 15),
    steps: proposal.steps?.length ? proposal.steps : (existing?.steps ?? []),
    ingredients: proposal.ingredients.map((ingredient, index) => ({
      id: existing?.ingredients[index]?.id ?? `${mealId}-ingredient-${index}`,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      storeId: ingredient.storeId,
    })),
  };
  return [...recipes.filter((recipe) => recipe.mealId !== mealId), next];
}

function applyProposal(meal: HouseholdSnapshot["meals"][number], proposal: MealProposalInput) {
  return {
    ...meal,
    title: proposal.title,
    pitch: proposal.pitch,
    prepMinutes: proposal.prepMinutes,
    audience: proposal.audience ?? meal.audience,
    servings: proposal.servings ?? meal.servings,
    isLeftovers: false,
    leftoverOfMealId: null,
  };
}

export function patchMealProposal(
  snapshot: HouseholdSnapshot,
  mealId: string,
  proposal: MealProposalInput,
): HouseholdSnapshot {
  if (snapshot.planning?.meals.some((meal) => meal.id === mealId)) {
    return {
      ...snapshot,
      planning: {
        ...snapshot.planning,
        meals: snapshot.planning.meals.map((meal) =>
          meal.id === mealId ? applyProposal(meal, proposal) : meal,
        ),
        recipes: recipesWithProposal(snapshot.planning.recipes, mealId, proposal),
        votes: snapshot.planning.votes.filter((vote) => vote.mealId !== mealId),
      },
    };
  }
  return {
    ...snapshot,
    meals: snapshot.meals.map((meal) => (meal.id === mealId ? applyProposal(meal, proposal) : meal)),
    recipes: recipesWithProposal(snapshot.recipes, mealId, proposal),
    votes: snapshot.votes.filter((vote) => vote.mealId !== mealId),
  };
}
