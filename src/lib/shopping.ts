import { catalogNameForSlug } from "./grocers";
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

/**
 * Locked-list sticky headers. Never a cart.
 * Trader Joe's and Smith's keep their fixed labels (any slug form). Every other
 * store the house set up shows under its own name, so a Walmart/Kroger house
 * gets a full list too.
 */
export const STORE_LABEL_TRADER_JOES = "Trader Joe's";
export const STORE_LABEL_SMITHS = "Smith's";
/** One section for the whole list when the house has no usable store. */
export const STORE_LABEL_FALLBACK = "Groceries";
/** Trailing section for lines whose store is gone or unknown, after the house's stores. */
export const STORE_LABEL_FALLBACK_OTHER = "Everything else";
export const FALLBACK_STORE_ID = "__list-fallback";
export const FALLBACK_STORE_SLUG = "other";

function labelFromSlug(slug: string): string | null {
  const words = slug
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length ? words.join(" ") : null;
}

export function listStoreLabel(store: Pick<Store, "slug"> & Partial<Pick<Store, "name">>): string | null {
  const slug = (store.slug ?? "").trim().toLowerCase();
  switch (slug) {
    case "trader-joes":
    case "trader-joe-s":
      return STORE_LABEL_TRADER_JOES;
    case "smiths":
    case "smith-s":
      return STORE_LABEL_SMITHS;
    default: {
      const name = store.name?.replace(/\s+/g, " ").trim();
      if (name) return name;
      if (!slug) return null;
      return catalogNameForSlug(slug) ?? labelFromSlug(slug);
    }
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

/**
 * Post-lock sticky sections, in the house's store order. Every line shows:
 * a line whose store is missing (deleted, unknown id, or no stores at all) or
 * has no usable label lands in one fallback section at the end.
 */
export function groupStickyStoreLists(
  items: ShoppingItem[],
  stores: Store[],
): Array<{ store: Store; label: string; items: ShoppingItem[] }> {
  const labelled: Array<{ store: Store; label: string; items: ShoppingItem[] }> = [];
  const placed = new Set<string>();
  for (const group of groupItemsByStore(items, stores)) {
    const label = listStoreLabel(group.store);
    if (!label) continue;
    labelled.push({ ...group, label });
    for (const item of group.items) placed.add(item.id);
  }

  const leftover = items
    .filter((item) => !placed.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (leftover.length === 0) return labelled;

  const label = labelled.length ? STORE_LABEL_FALLBACK_OTHER : STORE_LABEL_FALLBACK;
  const fallback: Store = {
    id: FALLBACK_STORE_ID,
    householdId: leftover[0]?.householdId ?? "",
    name: label,
    slug: FALLBACK_STORE_SLUG,
    sortOrder: Number.MAX_SAFE_INTEGER,
  };
  return [...labelled, { store: fallback, label, items: leftover }];
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
