import { isNightOff } from "./lock";
import { cookingScope } from "./open-weeks";
import type {
  HouseholdSnapshot,
  Meal,
  Membership,
  Recipe,
  ShoppingItem,
  ShoppingList,
  Store,
  Vote,
  WeekScope,
} from "./types";

export function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function mergeQuantities(items: ShoppingItem[]): ShoppingItem[] {
  const groups = new Map<string, ShoppingItem>();

  for (const item of items) {
    const key = `${item.storeId}::${normalizeItemName(item.name)}::${item.unit.toLowerCase()}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...item });
      continue;
    }
    existing.quantity = roundQuantity(existing.quantity + item.quantity);
    if (!existing.priceCents && item.priceCents != null) {
      existing.priceCents = item.priceCents;
      existing.priceSource = item.priceSource;
      existing.pricedAt = item.pricedAt;
    }
  }

  return [...groups.values()];
}

export function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ShoppingLine = {
  storeId: string;
  name: string;
  quantity: number;
  unit: string;
};

/** Store section + item. The amount is not part of the match. */
export function shoppingLineKey(item: Pick<ShoppingLine, "storeId" | "name" | "unit">): string {
  return `${item.storeId}::${normalizeItemName(item.name)}::${item.unit.trim().toLowerCase()}`;
}

export function scaleIngredientQuantity(
  quantity: number,
  fromServings: number,
  toServings: number,
): number {
  if (!Number.isFinite(quantity)) return 0;
  if (!Number.isFinite(fromServings) || fromServings <= 0) return roundQuantity(quantity);
  if (!Number.isFinite(toServings) || toServings <= 0) return roundQuantity(quantity);
  if (fromServings === toServings) return roundQuantity(quantity);
  return roundQuantity((quantity * toServings) / fromServings);
}

/**
 * Ingredients the week still needs. A night with a remove vote is not a dinner,
 * including when that vote was saved before lock.
 */
export function dinnerShoppingLines(input: {
  meals: Meal[];
  recipes: Recipe[];
  votes: Vote[];
  memberships?: Membership[];
}): ShoppingLine[] {
  const draft: ShoppingLine[] = [];

  for (const meal of input.meals) {
    if (isNightOff(meal.id, input.votes, input.memberships)) continue;
    const recipe = input.recipes.find((item) => item.mealId === meal.id);
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      draft.push({
        storeId: ingredient.storeId,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      });
    }
  }

  const groups = new Map<string, ShoppingLine>();
  for (const line of draft) {
    const key = shoppingLineKey(line);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...line, quantity: roundQuantity(line.quantity) });
      continue;
    }
    existing.quantity = roundQuantity(existing.quantity + line.quantity);
  }
  return [...groups.values()];
}

export function buildShoppingItems(input: {
  householdId: string;
  shoppingListId: string;
  meals: Meal[];
  recipes: Recipe[];
  votes: Vote[];
  memberships?: Membership[];
}): ShoppingItem[] {
  return dinnerShoppingLines(input).map((line, index) => ({
    id: `${input.shoppingListId}_${index}`,
    householdId: input.householdId,
    shoppingListId: input.shoppingListId,
    storeId: line.storeId,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    priceCents: null,
    priceSource: null,
    pricedAt: null,
    checked: false,
  }));
}

/**
 * Keep each line that is still needed. Same amount keeps its check.
 * A changed amount unchecks. New lines append unchecked. Gone lines drop.
 * Existing order stays; this does not sort the list.
 */
export function reconcileShoppingItems(
  list: Pick<ShoppingList, "id" | "householdId" | "items">,
  desired: readonly ShoppingLine[],
): { items: ShoppingItem[]; changed: boolean } {
  const desiredByKey = new Map<string, ShoppingLine>();
  for (const line of desired) {
    desiredByKey.set(shoppingLineKey(line), line);
  }

  const seen = new Set<string>();
  const items: ShoppingItem[] = [];
  let changed = false;

  for (const item of list.items) {
    const key = shoppingLineKey(item);
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    const next = desiredByKey.get(key);
    if (!next) {
      changed = true;
      continue;
    }
    seen.add(key);
    const quantity = roundQuantity(next.quantity);
    if (roundQuantity(item.quantity) !== quantity) {
      changed = true;
      items.push({ ...item, quantity, checked: false });
      continue;
    }
    items.push(item);
  }

  for (const [key, line] of desiredByKey) {
    if (seen.has(key)) continue;
    changed = true;
    items.push({
      id: `new:${list.id}:${key}`,
      householdId: list.householdId,
      shoppingListId: list.id,
      storeId: line.storeId,
      name: line.name,
      quantity: roundQuantity(line.quantity),
      unit: line.unit,
      priceCents: null,
      priceSource: null,
      pricedAt: null,
      checked: false,
    });
  }

  return { items, changed };
}

function rebuiltShoppingList(
  scope: WeekScope,
  memberships: Membership[],
): ShoppingList | null {
  if (!scope.shoppingList) return null;
  const desired = dinnerShoppingLines({
    meals: scope.meals,
    recipes: scope.recipes,
    votes: scope.votes,
    memberships,
  });
  const next = reconcileShoppingItems(scope.shoppingList, desired);
  if (!next.changed) return scope.shoppingList;
  return { ...scope.shoppingList, items: next.items };
}

/** Rebuild lists that already exist. A week with no list stays without one. */
export function withRebuiltShoppingLists(snapshot: HouseholdSnapshot): HouseholdSnapshot {
  const cookingList = rebuiltShoppingList(cookingScope(snapshot), snapshot.memberships);
  const planningList = snapshot.planning
    ? rebuiltShoppingList(snapshot.planning, snapshot.memberships)
    : null;
  const planning =
    snapshot.planning && planningList !== snapshot.planning.shoppingList
      ? { ...snapshot.planning, shoppingList: planningList }
      : snapshot.planning;
  if (cookingList === snapshot.shoppingList && planning === snapshot.planning) return snapshot;
  return {
    ...snapshot,
    shoppingList: cookingList,
    planning,
  };
}

export function shoppingListsToRebuild(snapshot: HouseholdSnapshot): string[] {
  const scopes = [cookingScope(snapshot), snapshot.planning].flatMap((scope) =>
    scope ? [scope] : [],
  );
  return scopes.flatMap((scope) => {
    if (!scope.shoppingList) return [];
    const desired = dinnerShoppingLines({
      meals: scope.meals,
      recipes: scope.recipes,
      votes: scope.votes,
      memberships: snapshot.memberships,
    });
    return reconcileShoppingItems(scope.shoppingList, desired).changed ? [scope.week.id] : [];
  });
}

/** Locked-list sticky headers — Trader Joe’s / Smith’s only. Never a cart. */
export const STORE_LABEL_TRADER_JOES = "Trader Joe's";
export const STORE_LABEL_SMITHS = "Smith's";

export function listStoreLabel(store: Pick<Store, "slug">): string | null {
  switch (store.slug) {
    case "trader-joes":
    case "trader-joe-s":
      return STORE_LABEL_TRADER_JOES;
    case "smiths":
    case "smith-s":
      return STORE_LABEL_SMITHS;
    default:
      return null;
  }
}

export function groupItemsByStore(
  items: ShoppingItem[],
  stores: Store[],
): Array<{ store: Store; items: ShoppingItem[] }> {
  const sortedStores = [...stores].sort((a, b) => a.sortOrder - b.sortOrder);
  return sortedStores
    .map((store) => ({
      store,
      items: items
        .filter((item) => item.storeId === store.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Post-lock sticky sections. Catalog slugs, plus apostrophe slugs saved before the picker passed a slug. */
export function groupStickyStoreLists(
  items: ShoppingItem[],
  stores: Store[],
): Array<{ store: Store; label: string; items: ShoppingItem[] }> {
  return groupItemsByStore(items, stores).flatMap((group) => {
    const label = listStoreLabel(group.store);
    return label ? [{ ...group, label }] : [];
  });
}

export function formatQuantity(quantity: number, unit: string): string {
  const shown = Number.isInteger(quantity) ? String(quantity) : String(roundQuantity(quantity));
  return unit ? `${shown} ${unit}` : shown;
}

/** Name + qty only. Prices stay off the list even when a source exists in the model. */
export function listItemDisplay(item: Pick<ShoppingItem, "name" | "quantity" | "unit">): {
  name: string;
  quantity: string;
} {
  return {
    name: item.name,
    quantity: formatQuantity(item.quantity, item.unit),
  };
}
