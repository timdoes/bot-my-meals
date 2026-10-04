import { describe, expect, it } from "vitest";
import { emptyHousehold } from "@/lib/seed";
import type { HouseholdSnapshot, Meal, ShoppingItem } from "@/lib/types";
import {
  LIST_CHECK_SAVE_ERROR,
  applyOptimistic,
  dropOptimistic,
  patchHousehold,
  patchItemChecked,
  patchMealProposal,
  patchMemberRole,
  patchStoreAdded,
  patchStoreRemoved,
  patchVote,
  queueOptimistic,
} from "@/lib/optimistic";

function snapshot(): HouseholdSnapshot {
  const base = emptyHousehold("House", {
    id: "user-1",
    email: "a@example.com",
    displayName: "Alex",
  });
  const meal: Meal = {
    id: "meal-1",
    householdId: base.household.id,
    weekId: base.week.id,
    dayIndex: 0,
    nightDate: "2026-09-27",
    title: "Chili",
    pitch: "A pot of chili.",
    audience: "family",
    servings: 4,
    prepMinutes: 40,
    isLeftovers: false,
    leftoverOfMealId: null,
    estimatedCostCents: null,
    estimatedCostSource: null,
    estimatedCostAsOf: null,
  };
  const item: ShoppingItem = {
    id: "item-1",
    householdId: base.household.id,
    shoppingListId: "list-1",
    storeId: base.stores[0]?.id ?? "store",
    name: "Beans",
    quantity: 2,
    unit: "can",
    priceCents: null,
    priceSource: null,
    pricedAt: null,
    checked: false,
  };
  return {
    ...base,
    meals: [meal],
    shoppingList: {
      id: "list-1",
      householdId: base.household.id,
      weekId: base.week.id,
      generatedAt: "2026-09-27T00:00:00.000Z",
      items: [item],
    },
  };
}

describe("optimistic snapshot patches", () => {
  it("uses the lock’s short list-check error", () => {
    expect(LIST_CHECK_SAVE_ERROR).toBe("Couldn\u2019t save \u2014 try again.");
  });

  it("checks a shopping item without waiting on the saved list", () => {
    const base = snapshot();
    const checked = patchItemChecked(base, "item-1", true);
    expect(checked.shoppingList?.items[0]?.checked).toBe(true);
    expect(base.shoppingList?.items[0]?.checked).toBe(false);
    expect(patchItemChecked(checked, "item-1", false).shoppingList?.items[0]?.checked).toBe(false);
  });

  it("keeps a swap note and drops a remove note", () => {
    const base = snapshot();
    const memberId = base.memberships[0]?.id ?? "";
    const swapped = patchVote(base, {
      mealId: "meal-1",
      membershipId: memberId,
      householdId: base.household.id,
      choice: "swap",
      note: "Too spicy",
    });
    expect(swapped.votes[0]).toMatchObject({ choice: "swap", note: "Too spicy" });
    const removed = patchVote(swapped, {
      mealId: "meal-1",
      membershipId: memberId,
      householdId: base.household.id,
      choice: "remove",
      note: "Too spicy",
    });
    expect(removed.votes).toHaveLength(1);
    expect(removed.votes[0]).toMatchObject({ choice: "remove", note: "" });
  });

  it("saves Request dinner people on that night only", () => {
    const base = snapshot();
    const other: Meal = {
      ...base.meals[0]!,
      id: "meal-2",
      dayIndex: 1,
      nightDate: "2026-09-28",
      servings: 5,
    };
    const housePlates = [...base.household.nightHeadcounts];
    const starting = {
      ...base,
      meals: [...base.meals, other],
      recipes: [
        {
          id: "recipe-1",
          mealId: "meal-1",
          servings: 3,
          prepMinutes: 10,
          cookMinutes: 20,
          steps: ["Cook."],
          ingredients: [],
        },
        {
          id: "recipe-2",
          mealId: "meal-2",
          servings: 5,
          prepMinutes: 10,
          cookMinutes: 20,
          steps: ["Cook."],
          ingredients: [],
        },
      ],
      week: { ...base.week, nightHeadcounts: [3, 5, 5, 1, 5, 3, 3] },
    };
    starting.meals[0] = { ...starting.meals[0]!, servings: 3 };
    const memberId = starting.memberships[0]?.id ?? "";
    const next = patchVote(starting, {
      mealId: "meal-1",
      membershipId: memberId,
      householdId: starting.household.id,
      choice: "request_new_meal",
      note: "Something light.",
      servings: 7,
    });
    expect(next.votes[0]).toMatchObject({ choice: "request_new_meal", note: "Something light." });
    expect(next.meals[0]?.servings).toBe(7);
    expect(next.meals[1]?.servings).toBe(5);
    expect(next.recipes[0]?.servings).toBe(7);
    expect(next.recipes[1]?.servings).toBe(5);
    expect(next.week.nightHeadcounts).toEqual([7, 5, 5, 1, 5, 3, 3]);
    expect(next.household.nightHeadcounts).toEqual(housePlates);
    expect(starting.meals[0]?.servings).toBe(3);
    expect(starting.meals[1]?.servings).toBe(5);
    expect(starting.week.nightHeadcounts).toEqual([3, 5, 5, 1, 5, 3, 3]);
    const swapOnly = patchVote(starting, {
      mealId: "meal-1",
      membershipId: memberId,
      householdId: starting.household.id,
      choice: "swap",
      note: "Too heavy.",
      servings: 7,
    });
    expect(swapOnly.meals[0]?.servings).toBe(3);
    expect(swapOnly.week.nightHeadcounts).toEqual([3, 5, 5, 1, 5, 3, 3]);
  });

  it("updates house plate defaults without rewriting this week's meals", () => {
    const base = snapshot();
    const servings = base.meals[0]?.servings;
    const next = patchHousehold(base, {
      nightHeadcounts: [3, 4, 4, 4, 4, 2, 2],
    });
    expect(next.household.nightHeadcounts[0]).toBe(3);
    expect(next.meals[0]?.servings).toBe(servings);
    expect(next.meals).toBe(base.meals);
    expect(next.household.nightsPlanned).toBe(7);
  });

  it("adds and removes a store", () => {
    const base = snapshot();
    const added = patchStoreAdded(base, { id: "store-new", name: "WinCo", slug: "winco" });
    expect(added.stores.map((store) => store.slug)).toContain("winco");
    expect(patchStoreAdded(added, { id: "store-new", name: "WinCo", slug: "winco" }).stores).toHaveLength(
      added.stores.length,
    );
    expect(patchStoreRemoved(added, "store-new").stores.map((store) => store.id)).not.toContain(
      "store-new",
    );
  });

  it("flips a member role and a proposed meal", () => {
    const base = snapshot();
    const memberId = base.memberships[0]?.id ?? "";
    const voted = patchVote(base, {
      mealId: "meal-1",
      membershipId: memberId,
      householdId: base.household.id,
      choice: "swap",
      note: "",
    });
    expect(patchMemberRole(voted, memberId, "voter").memberships[0]?.role).toBe("voter");
    const proposed = patchMealProposal(voted, "meal-1", {
      title: "Tacos",
      pitch: "Tuesday tacos.",
      prepMinutes: 25,
    });
    expect(proposed.meals[0]).toMatchObject({ title: "Tacos", pitch: "Tuesday tacos.", prepMinutes: 25 });
    expect(proposed.votes).toHaveLength(0);
  });

  it("lets a newer patch replace an older one and rolls back when that patch is dropped", () => {
    let pending = queueOptimistic<boolean>([], "item:1", 1, () => true);
    pending = queueOptimistic(pending, "item:1", 2, () => false);
    expect(applyOptimistic(true, pending)).toBe(false);
    pending = dropOptimistic(pending, 1);
    expect(applyOptimistic(true, pending)).toBe(false);
    pending = dropOptimistic(pending, 2);
    expect(applyOptimistic(true, pending)).toBe(true);
  });
});
