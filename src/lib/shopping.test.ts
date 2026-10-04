import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HouseholdSnapshot, Meal, Membership, Recipe, ShoppingItem, ShoppingList, Store, Vote } from "./types";
import { emptyHousehold } from "./seed";
import {
  STORE_LABEL_SMITHS,
  STORE_LABEL_TRADER_JOES,
  buildShoppingItems,
  dinnerShoppingLines,
  groupStickyStoreLists,
  listItemDisplay,
  listStoreLabel,
  mergeQuantities,
  normalizeItemName,
  reconcileShoppingItems,
  scaleIngredientQuantity,
  shoppingListsToRebuild,
  withRebuiltShoppingLists,
} from "./shopping";

const meal = (id: string): Meal => ({
  id,
  householdId: "h",
  weekId: "w",
  dayIndex: 0,
  nightDate: "2026-08-30",
  title: "Test",
  pitch: "",
  audience: "family",
  servings: 4,
  prepMinutes: 20,
  isLeftovers: false,
  leftoverOfMealId: null,
  estimatedCostCents: null,
  estimatedCostSource: null,
  estimatedCostAsOf: null,
});

describe("shopping merge", () => {
  it("combines duplicate names at the same store and unit", () => {
    const items: ShoppingItem[] = [
      {
        id: "1",
        householdId: "h",
        shoppingListId: "l",
        storeId: "tj",
        name: "Olive oil",
        quantity: 3,
        unit: "tbsp",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
      {
        id: "2",
        householdId: "h",
        shoppingListId: "l",
        storeId: "tj",
        name: "olive  oil",
        quantity: 2,
        unit: "tbsp",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
    ];
    const merged = mergeQuantities(items);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(5);
    expect(normalizeItemName("olive  oil")).toBe("olive oil");
  });

  it("omits removed nights and keeps leftover extras", () => {
    const votes: Vote[] = [
      {
        id: "v",
        householdId: "h",
        mealId: "skip-me",
        membershipId: "alex",
        choice: "remove",
        note: "travel",
        updatedAt: "2026-09-02T00:00:00.000Z",
      },
    ];
    const recipes: Recipe[] = [
      {
        id: "r1",
        mealId: "skip-me",
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 10,
        steps: [],
        ingredients: [
          { id: "i1", name: "Steak", quantity: 1, unit: "lb", storeId: "smiths" },
        ],
      },
      {
        id: "r2",
        mealId: "keep-me",
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 10,
        steps: [],
        ingredients: [
          { id: "i2", name: "Salsa", quantity: 1, unit: "jar", storeId: "tj" },
        ],
      },
    ];

    const items = buildShoppingItems({
      householdId: "h",
      shoppingListId: "list",
      meals: [meal("skip-me"), meal("keep-me")],
      recipes,
      votes,
    });

    expect(items.map((item) => item.name)).toEqual(["Salsa"]);
    expect(items[0].priceCents).toBeNull();
    expect(items[0].priceSource).toBeNull();
  });

  it("list rows expose name and quantity only — never a price", () => {
    const priced: ShoppingItem = {
      id: "1",
      householdId: "h",
      shoppingListId: "l",
      storeId: "tj",
      name: "Olive oil",
      quantity: 3,
      unit: "tbsp",
      priceCents: 399,
      priceSource: "invented",
      pricedAt: "2026-09-01",
      checked: false,
    };
    expect(listItemDisplay(priced)).toEqual({ name: "Olive oil", quantity: "3 tbsp" });
    expect(JSON.stringify(listItemDisplay(priced))).not.toContain("399");
    expect(JSON.stringify(listItemDisplay(priced))).not.toContain("$");
  });
});

describe("sticky store labels", () => {
  it("labels Trader Joe's and Smith's only — never Kroger or a third store", () => {
    expect(listStoreLabel({ slug: "trader-joes" })).toBe(STORE_LABEL_TRADER_JOES);
    expect(listStoreLabel({ slug: "smiths" })).toBe(STORE_LABEL_SMITHS);
    expect(listStoreLabel({ slug: "trader-joe-s" })).toBe(STORE_LABEL_TRADER_JOES);
    expect(listStoreLabel({ slug: "smith-s" })).toBe(STORE_LABEL_SMITHS);
    expect(listStoreLabel({ slug: "kroger" })).toBeNull();
    expect(listStoreLabel({ slug: "costco" })).toBeNull();
    expect(STORE_LABEL_TRADER_JOES).toBe("Trader Joe's");
    expect(STORE_LABEL_SMITHS).toBe("Smith's");

    const stores: Store[] = [
      { id: "tj", householdId: "h", name: "TJ", slug: "trader-joes", sortOrder: 0 },
      { id: "sm", householdId: "h", name: "Kroger", slug: "kroger", sortOrder: 1 },
      { id: "smiths", householdId: "h", name: "Smiths Market", slug: "smiths", sortOrder: 2 },
    ];
    const items: ShoppingItem[] = [
      {
        id: "1",
        householdId: "h",
        shoppingListId: "l",
        storeId: "tj",
        name: "Salsa",
        quantity: 1,
        unit: "jar",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
      {
        id: "2",
        householdId: "h",
        shoppingListId: "l",
        storeId: "sm",
        name: "Milk",
        quantity: 1,
        unit: "gal",
        priceCents: 399,
        priceSource: "invented",
        pricedAt: "2026-09-01",
        checked: false,
      },
      {
        id: "3",
        householdId: "h",
        shoppingListId: "l",
        storeId: "smiths",
        name: "Chicken",
        quantity: 1,
        unit: "ct",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
    ];

    const groups = groupStickyStoreLists(items, stores);
    expect(groups.map((group) => group.label)).toEqual(["Trader Joe's", "Smith's"]);
    expect(groups.flatMap((group) => group.items.map((item) => item.name))).toEqual([
      "Salsa",
      "Chicken",
    ]);
    expect(JSON.stringify(groups)).not.toContain("Kroger");
    expect(JSON.stringify(groups)).not.toContain("Milk");
    expect(JSON.stringify(groups)).not.toContain("399");
  });

  it("renders items when the store slug is the apostrophe form smith-s", () => {
    const slug = "Smith's".toLowerCase().replace(/[^a-z0-9]+/g, "-");
    expect(slug).toBe("smith-s");
    const stores: Store[] = [
      { id: "smiths-store", householdId: "h", name: "Smith's", slug, sortOrder: 0 },
      { id: "tj-store", householdId: "h", name: "Trader Joe's", slug: "trader-joe-s", sortOrder: 1 },
    ];
    const items: ShoppingItem[] = [
      {
        id: "1",
        householdId: "h",
        shoppingListId: "l",
        storeId: "smiths-store",
        name: "Chicken thighs",
        quantity: 1.5,
        unit: "lb",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
      {
        id: "2",
        householdId: "h",
        shoppingListId: "l",
        storeId: "smiths-store",
        name: "Yellow onion",
        quantity: 1,
        unit: "ct",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
      {
        id: "3",
        householdId: "h",
        shoppingListId: "l",
        storeId: "tj-store",
        name: "Salsa",
        quantity: 1,
        unit: "jar",
        priceCents: null,
        priceSource: null,
        pricedAt: null,
        checked: false,
      },
    ];

    const groups = groupStickyStoreLists(items, stores);
    expect(groups.map((group) => group.label)).toEqual(["Smith's", "Trader Joe's"]);
    expect(groups[0]?.items.map((item) => item.name)).toEqual(["Chicken thighs", "Yellow onion"]);
    expect(groups[1]?.items.map((item) => item.name)).toEqual(["Salsa"]);
  });

  it("rewrites apostrophe store slugs to the catalog slugs", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20260927190000_normalize_store_slugs.sql"),
      "utf8",
    );
    expect(sql).toContain("set slug = 'smiths'");
    expect(sql).toContain("bad.slug = 'smith-s'");
    expect(sql).toContain("set slug = 'trader-joes'");
    expect(sql).toContain("bad.slug = 'trader-joe-s'");
  });
});

describe("Clear Sky list craft", () => {
  it("keeps sticky store headers on card + primary, with no prices or cart", () => {
    const list = readFileSync(path.resolve(import.meta.dirname, "../app/list/page.tsx"), "utf8");
    const row = readFileSync(
      path.resolve(import.meta.dirname, "../components/list-row.tsx"),
      "utf8",
    );
    expect(list).toContain("groupStickyStoreLists");
    expect(list).toContain('data-slot="list-store"');
    expect(list).toContain("bg-card/95");
    expect(list).toContain("text-primary");
    expect(list).toContain("sticky");
    expect(list).toContain("{group.label}");
    expect(list).not.toContain("group.store.name");
    expect(list).not.toContain("$");
    expect(list).not.toContain("cart");
    expect(list).not.toContain("Kroger");
    expect(list).not.toContain("#b35025");
    expect(list).not.toContain("Fraunces");
    expect(row).toContain('data-slot="list-row"');
    expect(row).toContain("font-mono");
    expect(row).toContain("min-h-12");
    expect(row).not.toContain("Loader2");
    expect(row).not.toContain("animate-spin");
    expect(row).not.toContain("aria-busy");
    expect(row).not.toContain("syncing");
    expect(list).toContain("useOptimisticValue");
    expect(list).not.toContain("syncing");
    expect(list).not.toContain(".pending");
    expect(list).toContain("LIST_PRE_LOCK_DESCRIPTION");
    expect(list).toContain("removedMealIds");
    expect(list).not.toContain("skippedMealIds");
    expect(list).not.toMatch(/approves or skips/i);
    expect(list).not.toContain("Approve");
    expect(list).not.toContain("Skip");
    expect(list).not.toContain("You approved");
    expect(list).not.toContain("Your vote needed");
  });
});

const smiths = "smiths";
const traderJoes = "tj";

function recipeFor(
  mealId: string,
  ingredients: Recipe["ingredients"],
): Recipe {
  return {
    id: `recipe-${mealId}`,
    mealId,
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 20,
    steps: ["Cook and serve."],
    ingredients,
  };
}

function ingredient(
  id: string,
  name: string,
  quantity: number,
  unit: string,
  storeId = smiths,
): Recipe["ingredients"][number] {
  return { id, name, quantity, unit, storeId };
}

function listItem(
  id: string,
  name: string,
  quantity: number,
  unit: string,
  checked: boolean,
  storeId = smiths,
): ShoppingItem {
  return {
    id,
    householdId: "h",
    shoppingListId: "list-week",
    storeId,
    name,
    quantity,
    unit,
    priceCents: null,
    priceSource: null,
    pricedAt: null,
    checked,
  };
}

function removeVote(mealId: string, at: string): Vote {
  return {
    id: `vote-${mealId}`,
    householdId: "h",
    mealId,
    membershipId: "alex",
    choice: "remove",
    note: "",
    updatedAt: at,
  };
}

const voter: Membership = {
  id: "alex",
  householdId: "h",
  userId: "user-alex",
  role: "owner",
  displayName: "Alex",
  email: "alex@example.com",
};

describe("shopping list rebuild", () => {
  const saturday = { ...meal("sat"), nightDate: "2026-10-10", title: "Korean beef bowls" };
  const tuesday = { ...meal("tue"), nightDate: "2026-10-06", title: "Beef taco lettuce wraps" };
  const removeBeforeLock = removeVote("sat", "2026-10-04T08:08:00.000Z");
  const recipes = [
    recipeFor("sat", [
      ingredient("g", "Fresh ginger", 1, "tbsp"),
      ingredient("s", "Brown sugar", 1, "tbsp"),
      ingredient("o", "Green onions", 1, "bunch"),
      ingredient("e", "Sesame oil", 2, "tbsp"),
      ingredient("y", "Soy sauce", 0.25, "cup"),
      ingredient("b", "Ground beef", 1.5, "lb"),
    ]),
    recipeFor("tue", [
      ingredient("b2", "Ground beef", 0.75, "lb"),
      ingredient("sa", "Salsa", 1, "jar", traderJoes),
    ]),
  ];

  function lockedLines() {
    return dinnerShoppingLines({
      meals: [saturday, tuesday],
      recipes,
      votes: [removeBeforeLock],
      memberships: [voter],
    });
  }

  it("omits a night whose remove vote was saved before lock", () => {
    const lines = lockedLines();
    expect(lines.map((line) => line.name).sort()).toEqual(["Ground beef", "Salsa"]);
    expect(lines.find((line) => line.name === "Ground beef")).toMatchObject({
      quantity: 0.75,
      unit: "lb",
      storeId: smiths,
    });
    expect(lines.map((line) => line.name)).not.toContain("Fresh ginger");
    expect(buildShoppingItems({
      householdId: "h",
      shoppingListId: "list-week",
      meals: [saturday, tuesday],
      recipes,
      votes: [removeBeforeLock],
      memberships: [voter],
    }).map((item) => item.name)).not.toContain("Fresh ginger");
  });

  it("drops Saturday-only lines, corrects a merged amount, and leaves the other lines", () => {
    const existing: ShoppingItem[] = [
      { ...listItem("salsa", "Salsa", 1, "jar", true, traderJoes), priceCents: 399, priceSource: "store", pricedAt: "2026-10-04" },
      { ...listItem("beef", "Ground beef", 2.25, "lb", true), priceCents: 899, priceSource: "store", pricedAt: "2026-10-04" },
      listItem("7557fb8d", "Fresh ginger", 1, "tbsp", true),
      listItem("sugar", "Brown sugar", 1, "tbsp", false),
      listItem("onions", "Green onions", 1, "bunch", true),
      listItem("oil", "Sesame oil", 2, "tbsp", false),
      listItem("soy", "Soy sauce", 0.25, "cup", true),
    ];
    const desired = [
      ...lockedLines(),
      { storeId: traderJoes, name: "Tortillas", quantity: 8, unit: "ct" },
    ];
    const next = reconcileShoppingItems(
      { id: "list-week", householdId: "h", items: existing },
      desired,
    );

    expect(next.changed).toBe(true);
    expect(next.items.map((item) => item.name)).toEqual(["Salsa", "Ground beef", "Tortillas"]);
    expect(next.items[0]).toBe(existing[0]);
    expect(next.items[0]).toMatchObject({ checked: true, quantity: 1, priceCents: 399 });
    expect(next.items[1]).toMatchObject({
      id: "beef",
      quantity: 0.75,
      unit: "lb",
      checked: false,
      priceCents: 899,
      priceSource: "store",
    });
    expect(next.items[2]).toMatchObject({
      name: "Tortillas",
      quantity: 8,
      checked: false,
      priceCents: null,
      priceSource: null,
      pricedAt: null,
    });
    expect(next.items.map((item) => item.id)).not.toContain("7557fb8d");
    expect(next.items.map((item) => item.name)).not.toContain("Fresh ginger");
    expect(next.items.map((item) => item.name)).not.toContain("Sesame oil");
  });

  it("keeps ginger when another night still needs it, at the corrected amount", () => {
    const lines = dinnerShoppingLines({
      meals: [saturday, tuesday],
      recipes: [
        recipes[0]!,
        recipeFor("tue", [
          ingredient("b2", "Ground beef", 0.75, "lb"),
          ingredient("g2", "Fresh ginger", 1, "tbsp"),
        ]),
      ],
      votes: [removeBeforeLock],
      memberships: [voter],
    });
    expect(lines.find((line) => line.name === "Fresh ginger")).toMatchObject({ quantity: 1, unit: "tbsp" });
    expect(lines.find((line) => line.name === "Ground beef")?.quantity).toBe(0.75);
    const next = reconcileShoppingItems(
      {
        id: "list-week",
        householdId: "h",
        items: [
          listItem("ginger", "Fresh ginger", 2, "tbsp", true),
          listItem("beef", "Ground beef", 2.25, "lb", true),
        ],
      },
      lines,
    );
    expect(next.items.map((item) => item.name)).toEqual(["Fresh ginger", "Ground beef"]);
    expect(next.items[0]).toMatchObject({ id: "ginger", quantity: 1, checked: false });
    expect(next.items[1]).toMatchObject({ id: "beef", quantity: 0.75, checked: false });
  });

  it("keeps a checked line when a swap changes only other lines", () => {
    const existing = [
      listItem("rice", "Rice", 1, "cup", true),
      listItem("steak", "Steak", 1, "lb", true),
    ];
    const next = reconcileShoppingItems(
      { id: "list-week", householdId: "h", items: existing },
      [
        { storeId: smiths, name: "Rice", quantity: 1, unit: "cup" },
        { storeId: smiths, name: "Tortillas", quantity: 8, unit: "ct" },
      ],
    );
    expect(next.items[0]?.id).toBe("rice");
    expect(next.items[1]?.id).toContain("new:list-week:");
    expect(next.items[0]).toBe(existing[0]);
    expect(next.items[0]?.checked).toBe(true);
    expect(next.items[1]).toMatchObject({ name: "Tortillas", checked: false, priceCents: null });
    expect(next.items.map((item) => item.name)).not.toContain("Steak");
  });

  it("unchecks only the line whose amount changed when servings change", () => {
    expect(scaleIngredientQuantity(1, 4, 2)).toBe(0.5);
    expect(scaleIngredientQuantity(1, 4, 4)).toBe(1);
    const existing = [
      listItem("ginger", "Fresh ginger", 1, "tbsp", true),
      listItem("salt", "Salt", 1, "tsp", true),
    ];
    const next = reconcileShoppingItems(
      { id: "list-week", householdId: "h", items: existing },
      [
        { storeId: smiths, name: "Fresh ginger", quantity: scaleIngredientQuantity(1, 4, 2), unit: "tbsp" },
        { storeId: smiths, name: "Salt", quantity: 1, unit: "tsp" },
      ],
    );
    expect(next.items).toHaveLength(2);
    expect(next.items[0]).toMatchObject({ id: "ginger", quantity: 0.5, checked: false });
    expect(next.items[1]).toBe(existing[1]);
    expect(next.items[1]?.checked).toBe(true);
  });

  it("does not invent a list, and does not rebuild the other week", () => {
    const base = emptyHousehold("House", {
      id: "user-1",
      email: "a@example.com",
      displayName: "Alex",
    });
    const memberId = base.memberships[0]?.id ?? "alex";
    const storeId = base.stores.find((store) => store.slug === "smiths")?.id ?? smiths;
    const cookingMeal = { ...meal("sat"), householdId: base.household.id, weekId: base.week.id };
    const planningMeal = {
      ...meal("plan"),
      householdId: base.household.id,
      weekId: "week-next",
      title: "Soup",
    };
    const planningList: ShoppingList = {
      id: "list-next",
      householdId: base.household.id,
      weekId: "week-next",
      generatedAt: "2026-10-04T15:30:00.000Z",
      items: [
        {
          ...listItem("broth", "Broth", 1, "qt", true, storeId),
          householdId: base.household.id,
          shoppingListId: "list-next",
        },
      ],
    };
    const stale: ShoppingList = {
      id: "list-week",
      householdId: base.household.id,
      weekId: base.week.id,
      generatedAt: "2026-10-04T15:30:00.000Z",
      items: [
        {
          ...listItem("7557fb8d", "Fresh ginger", 1, "tbsp", true, storeId),
          householdId: base.household.id,
        },
      ],
    };
    const snapshot: HouseholdSnapshot = {
      ...base,
      week: { ...base.week, status: "locked" },
      meals: [cookingMeal],
      votes: [{ ...removeVote("sat", "2026-10-04T08:08:00.000Z"), membershipId: memberId, householdId: base.household.id }],
      recipes: [
        {
          ...recipeFor("sat", [ingredient("g", "Fresh ginger", 1, "tbsp", storeId)]),
          servings: cookingMeal.servings,
        },
      ],
      shoppingList: stale,
      planning: {
        week: { ...base.week, id: "week-next", status: "locked", startsOn: "2026-10-11" },
        meals: [planningMeal],
        votes: [],
        recipes: [recipeFor("plan", [ingredient("br", "Broth", 1, "qt", storeId)])],
        shoppingList: planningList,
        ballotRequest: null,
      },
    };

    const next = withRebuiltShoppingLists(snapshot);
    expect(next.shoppingList?.items).toEqual([]);
    expect(next.planning?.shoppingList).toBe(planningList);
    expect(shoppingListsToRebuild(snapshot)).toEqual([base.week.id]);

    const unlisted = withRebuiltShoppingLists({ ...snapshot, shoppingList: null });
    expect(unlisted.shoppingList).toBeNull();
    expect(shoppingListsToRebuild({ ...snapshot, shoppingList: null })).toEqual([]);
  });

  it("lock_week skips removed nights and the rebuild does not wake the bot", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20261004180000_shopping_list_rebuild.sql"),
      "utf8",
    );
    const lines = sql.slice(
      sql.indexOf("function private.week_shopping_lines"),
      sql.indexOf("revoke all on function private.shopping_name_key"),
    );
    const off = sql.slice(
      sql.indexOf("function private.night_is_off"),
      sql.indexOf("function private.week_shopping_lines"),
    );
    const lockFn = sql.slice(
      sql.indexOf("function public.lock_week"),
      sql.indexOf("function public.rebuild_week_shopping_list"),
    );
    const rebuild = sql.slice(
      sql.indexOf("function public.rebuild_week_shopping_list"),
      sql.indexOf("revoke all on function public.rebuild_week_shopping_list"),
    );
    expect(off).toContain("v.choice in ('remove', 'skip')");
    expect(off).toContain("mem.role in ('owner', 'voter')");
    expect(lines).toContain("not private.night_is_off(m.id)");
    expect(lockFn).toContain("from private.week_shopping_lines(target.id) lines");
    expect(lockFn).not.toContain("v.choice = 'skip'");
    expect(rebuild).toContain("if lid is null");
    expect(rebuild).toContain("checked = false");
    expect(rebuild).not.toMatch(/insert into public\.shopping_lists/i);
    expect(rebuild).not.toMatch(/delete from public\.shopping_lists/i);
    expect(rebuild).not.toMatch(/update\s+public\.weeks/i);
    expect(rebuild).not.toMatch(/update\s+public\.households/i);
    expect(rebuild).not.toMatch(/household_stores/i);
    expect(rebuild).not.toContain("pg_net");
    expect(rebuild).not.toContain("bot_wake");
    expect(rebuild).not.toContain("needs_work");
    expect(rebuild).not.toContain("check_now");

    const repo = readFileSync(path.resolve(import.meta.dirname, "supabase/repo.ts"), "utf8");
    const sync = repo.slice(
      repo.indexOf("export async function supabaseRebuildWeekShoppingList"),
      repo.indexOf("export async function supabaseLockWeek"),
    );
    const save = repo.slice(
      repo.indexOf("export async function supabaseSaveNightServings"),
      repo.indexOf("export async function supabaseSetVote"),
    );
    expect(sync).toContain("rebuild_week_shopping_list");
    expect(sync).toContain("shoppingListsToRebuild");
    expect(sync).not.toContain("requestBotWake");
    expect(sync).not.toContain("needs_work");
    expect(sync).not.toContain("check_now");
    expect(save).toContain("scaleIngredientQuantity");
    expect(save).not.toContain("requestBotWake");
    expect(save).not.toContain("check_now");

    const provider = readFileSync(
      path.resolve(import.meta.dirname, "../components/supper-provider.tsx"),
      "utf8",
    );
    const refresh = provider.slice(
      provider.indexOf("const refresh = useCallback"),
      provider.indexOf("const setForegroundWeekTarget"),
    );
    expect(provider).toContain("withRebuiltShoppingLists");
    expect(refresh).toContain("supabaseSyncShoppingLists");
    expect(refresh).not.toContain("requestBotWake");
    expect(refresh).not.toContain("wakeWeekOrPlanChange");
    expect(refresh).not.toContain("check_now");
    const row = readFileSync(
      path.resolve(import.meta.dirname, "../components/list-row.tsx"),
      "utf8",
    );
    expect(row).not.toContain("Loader2");
    expect(row).not.toContain("animate-spin");
  });
});

