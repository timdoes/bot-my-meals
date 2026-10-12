import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BallotCard } from "@/components/ballot-card";
import { EmptyDayCard } from "@/components/empty-day-card";
import { ListRow } from "@/components/list-row";
import { NightCard } from "@/components/night-card";
import { RecipeBlock } from "@/components/recipe-view";
import { emptyHousehold } from "./seed";
import type {
  FoodRule,
  HouseholdEater,
  HouseholdSnapshot,
  Meal,
  Recipe,
  RecipeFoodHold,
  WeekNightAttendee,
  WeekNightList,
} from "./types";
import {
  FOOD_HOLD_ACK,
  FOOD_HOLD_ASK,
  FOOD_RULE_CHECK_LABEL,
  FOOD_RULE_CHECK_LINE,
  FOOD_RULE_CONFLICT_CODE,
  FOOD_RULE_CONFLICTS,
  FOOD_RULE_COOK_CHECK,
  FOOD_RULE_HEADS_UP_ANYWAY,
  FOOD_RULE_HEADS_UP_ELSE,
  FOOD_RULE_NEEDS_CHANGE,
  FOOD_RULE_NEEDS_CHANGE_CODE,
  cardFoodRuleHits,
  findMealForDayName,
  foodHoldBody,
  foodRuleChipLabel,
  foodRuleHeadsUpLine,
  foodRulesForNight,
  hasFoodRuleUi,
  headsUpForText,
  mealRuleHits,
  recipeHoldView,
  recipeSoftHits,
  reorderFoodRuleConflict,
  savedMealFoodRuleConflict,
  shoppingItemCheckTone,
  weekAllergyLockHits,
  weekShowsAllergenCheckLine,
} from "./food-rule-check";
import { mapFoodRuleActionError, mapLockWeekError, mapMealReorderError } from "./lock";
import { LOCK_FOOD_RULE_ERROR, REORDER_FOOD_RULE_ERROR } from "./lock-success";

const srcRoot = path.resolve(import.meta.dirname, "..");

function rule(partial: Partial<FoodRule> & Pick<FoodRule, "id" | "foodLabel" | "severity">): FoodRule {
  return {
    householdId: "house",
    subjectMembershipId: null,
    subjectEaterId: null,
    foodKey: partial.foodLabel.toLowerCase(),
    allergenCode: partial.foodLabel.toLowerCase() === "peanuts" ? "peanuts" : null,
    details: "",
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function meal(partial: Partial<Meal> & Pick<Meal, "id" | "title" | "dayIndex">): Meal {
  return {
    householdId: "house",
    weekId: "week-cook",
    nightDate: `2026-10-0${partial.dayIndex + 4}`,
    pitch: "",
    audience: "family",
    servings: 4,
    prepMinutes: 20,
    isLeftovers: false,
    leftoverOfMealId: null,
    estimatedCostCents: null,
    estimatedCostSource: null,
    estimatedCostAsOf: null,
    ...partial,
  };
}

function house(overrides: Partial<HouseholdSnapshot> = {}): HouseholdSnapshot {
  const base = emptyHousehold("Alex house");
  return {
    ...base,
    household: { ...base.household, id: "house" },
    week: { ...base.week, id: "week-cook" },
    memberships: [
      {
        id: "mem-alex",
        householdId: "house",
        userId: "u-alex",
        role: "owner",
        displayName: "Alex",
        email: "alex@example.com",
      },
    ],
    eaters: [
      {
        id: "e-sam",
        householdId: "house",
        displayName: "Sam",
        createdAt: "2026-10-11T00:00:00.000Z",
      } satisfies HouseholdEater,
    ],
    ...overrides,
  };
}

describe("live-safety", () => {
  it("shows nothing when rules and holds are empty", () => {
    const snapshot = house();
    expect(hasFoodRuleUi(snapshot)).toBe(false);
    expect(foodRulesForNight(snapshot, "week-cook", 2)).toEqual([]);
    expect(mealRuleHits(snapshot, meal({ id: "m2", title: "Thai peanut noodle bowls", dayIndex: 2 }))).toEqual([]);
    expect(weekAllergyLockHits(snapshot, "week-cook")).toEqual([]);
    expect(weekShowsAllergenCheckLine(snapshot, "week-cook")).toBe(false);
    expect(shoppingItemCheckTone(snapshot, "week-cook", "peanut sauce")).toBeNull();
    expect(savedMealFoodRuleConflict(snapshot, "Satay")).toBe(false);
    expect(recipeHoldView(snapshot, { id: "r1", mealId: "m2", servings: 4, prepMinutes: 10, cookMinutes: 10, steps: [], ingredients: [] })).toBeNull();
  });
});

describe("per-night attendee scope", () => {
  const peanut = rule({
    id: "r-peanut",
    foodLabel: "Peanuts",
    severity: "allergy",
    allergenCode: "peanuts",
    subjectEaterId: "e-sam",
  });
  const dairy = rule({
    id: "r-dairy",
    foodLabel: "Dairy",
    foodKey: "dairy",
    allergenCode: "milk",
    severity: "intolerance",
    subjectMembershipId: "mem-alex",
  });
  const mushrooms = rule({ id: "r-mush", foodLabel: "Mushrooms", severity: "dislike" });

  it("treats no attendee rows as everyone, and a named list as only those people", () => {
    const everyone = house({ foodRules: [peanut, dairy, mushrooms] });
    expect(foodRulesForNight(everyone, "week-cook", 2).map((row) => row.id)).toEqual([
      "r-peanut",
      "r-dairy",
      "r-mush",
    ]);

    const attendees: WeekNightAttendee[] = [
      {
        id: "a1",
        householdId: "house",
        weekId: "week-cook",
        dayIndex: 2,
        membershipId: "mem-alex",
        eaterId: null,
      },
    ];
    const lists: WeekNightList[] = [
      { householdId: "house", weekId: "week-cook", dayIndex: 2, guests: 0, updatedAt: "t" },
    ];
    const named = house({ foodRules: [peanut, dairy, mushrooms], nightAttendees: attendees, nightLists: lists });
    expect(foodRulesForNight(named, "week-cook", 2).map((row) => row.id)).toEqual(["r-dairy", "r-mush"]);
  });

  it("keeps whole-house rules on a named-list night", () => {
    const houseRule = rule({ id: "r-house", foodLabel: "Shellfish", severity: "allergy", allergenCode: "shellfish" });
    const named = house({
      foodRules: [houseRule, peanut],
      nightAttendees: [
        {
          id: "a1",
          householdId: "house",
          weekId: "week-cook",
          dayIndex: 2,
          membershipId: "mem-alex",
          eaterId: null,
        },
      ],
    });
    expect(foodRulesForNight(named, "week-cook", 2).map((row) => row.id)).toEqual(["r-house"]);
  });
});

describe("meal hits and copy", () => {
  const peanut = rule({
    id: "r-peanut",
    foodLabel: "Peanuts",
    severity: "allergy",
    allergenCode: "peanuts",
    subjectEaterId: "e-sam",
  });

  it("flags an allergy on title or pitch and names the person", () => {
    const snapshot = house({
      foodRules: [peanut],
      meals: [meal({ id: "m2", title: "Thai peanut noodle bowls", dayIndex: 2, weekId: "week-cook" })],
    });
    const hits = mealRuleHits(snapshot, snapshot.meals[0]!);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.who).toBe("Sam");
    expect(foodRuleChipLabel(hits[0]!)).toBe("Peanuts · Sam’s allergy");
    expect(cardFoodRuleHits(snapshot, snapshot.meals[0]!).allergy?.foodLabel).toBe("Peanuts");
    expect(weekAllergyLockHits(snapshot, "week-cook")).toHaveLength(1);
  });

  it("does not chip a dislike on the week card, and skips empty or removed nights", () => {
    const dislike = rule({ id: "r-onion", foodLabel: "Onion", severity: "dislike" });
    const snapshot = house({
      foodRules: [dislike, peanut],
      meals: [
        meal({ id: "m0", title: "", dayIndex: 0 }),
        meal({ id: "m1", title: "Onion soup", dayIndex: 1 }),
        meal({ id: "m2", title: "Peanut satay", dayIndex: 2 }),
      ],
      votes: [
        {
          id: "v1",
          householdId: "house",
          mealId: "m2",
          membershipId: "mem-alex",
          choice: "remove",
          note: "",
          updatedAt: "t",
        },
      ],
    });
    expect(mealRuleHits(snapshot, snapshot.meals[0]!)).toEqual([]);
    expect(cardFoodRuleHits(snapshot, snapshot.meals[1]!).allergy).toBeNull();
    expect(cardFoodRuleHits(snapshot, snapshot.meals[1]!).intolerance).toBeNull();
    expect(mealRuleHits(snapshot, snapshot.meals[1]!)[0]?.severity).toBe("dislike");
    expect(mealRuleHits(snapshot, snapshot.meals[2]!)).toEqual([]);
  });

  it("uses spec heads-up, hold, and list strings", () => {
    const hit = {
      ruleId: "r-peanut",
      foodLabel: "Peanuts",
      foodKey: "peanuts",
      severity: "allergy" as const,
      who: "Sam",
      matchedTerm: "peanut",
    };
    expect(foodRuleHeadsUpLine(hit)).toBe("Heads up: Peanuts is on Sam’s allergy list.");
    expect(foodHoldBody("Sam")).toBe("On Sam’s allergy list. Check labels before cooking.");
    expect(FOOD_HOLD_ASK).toBe("Ask for a new recipe");
    expect(FOOD_HOLD_ACK).toBe("I’ve checked");
    expect(FOOD_RULE_HEADS_UP_ELSE).toBe("Request something else");
    expect(FOOD_RULE_HEADS_UP_ANYWAY).toBe("Request anyway");
    expect(FOOD_RULE_CHECK_LABEL).toBe("Check label");
    expect(FOOD_RULE_CHECK_LINE).toBe("Check labels for allergens.");
    expect(FOOD_RULE_COOK_CHECK.toLowerCase()).not.toMatch(/\btap\b|\bclick\b|\biphone\b|\bgrandma\b/);
  });
});

describe("heads-up, holds, shopping, favorites, reorder", () => {
  const peanut = rule({
    id: "r-peanut",
    foodLabel: "Peanuts",
    severity: "allergy",
    allergenCode: "peanuts",
    subjectEaterId: "e-sam",
  });

  it("scopes request heads-up to the night's attendees", () => {
    const snapshot = house({
      foodRules: [peanut],
      nightAttendees: [
        {
          id: "a1",
          householdId: "house",
          weekId: "week-cook",
          dayIndex: 2,
          membershipId: "mem-alex",
          eaterId: null,
        },
      ],
    });
    expect(headsUpForText(snapshot, "week-cook", 1, "peanut noodles")?.foodLabel).toBe("Peanuts");
    expect(headsUpForText(snapshot, "week-cook", 2, "peanut noodles")).toBeNull();
    expect(headsUpForText(snapshot, "week-cook", 1, "")).toBeNull();
  });

  it("holds an unacked allergy recipe and reveals it after ack", () => {
    const dinner = meal({ id: "m2", title: "Stir fry", dayIndex: 2, pitch: "Weeknight noodles" });
    const recipe: Recipe = {
      id: "rec-1",
      mealId: "m2",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 15,
      steps: ["Cook"],
      ingredients: [
        { id: "i1", name: "peanut sauce", quantity: 1, unit: "jar", storeId: "s" },
      ],
    };
    const hold: RecipeFoodHold = {
      id: "h1",
      householdId: "house",
      recipeId: "rec-1",
      ruleId: "r-peanut",
      matchedTerm: "peanut",
      createdAt: "t",
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
    const snapshot = house({ foodRules: [peanut], meals: [dinner], recipes: [recipe], foodHolds: [hold] });
    const view = recipeHoldView(snapshot, recipe);
    expect(view?.banner).toBe("May contain Peanuts");
    expect(view?.body).toContain("On Sam’s allergy list.");
    expect(view?.holdIds).toEqual(["h1"]);

    const acked = house({
      foodRules: [peanut],
      meals: [dinner],
      recipes: [recipe],
      foodHolds: [{ ...hold, acknowledgedAt: "2026-10-12T00:00:00.000Z", acknowledgedBy: "u" }],
    });
    expect(recipeHoldView(acked, recipe)).toBeNull();
    expect(recipeSoftHits(acked, recipe).dislikes).toEqual([]);
  });

  it("pills shopping lines for in-scope allergens and marks a conflicting favorite", () => {
    const snapshot = house({
      foodRules: [peanut],
      meals: [meal({ id: "m2", title: "Stir fry", dayIndex: 2 })],
    });
    expect(shoppingItemCheckTone(snapshot, "week-cook", "peanut sauce")).toBe("allergy");
    expect(shoppingItemCheckTone(snapshot, "week-cook", "rice")).toBeNull();
    expect(weekShowsAllergenCheckLine(snapshot, "week-cook")).toBe(true);
    expect(savedMealFoodRuleConflict(snapshot, "Thai peanut noodle bowls")).toBe(true);
    expect(savedMealFoodRuleConflict(snapshot, "Roast chicken")).toBe(false);
  });

  it("detects a reorder that would move an allergen onto a night in scope", () => {
    const snapshot = house({
      foodRules: [peanut],
      meals: [
        meal({ id: "m1", title: "Roast chicken", dayIndex: 1 }),
        meal({ id: "m2", title: "Thai peanut noodle bowls", dayIndex: 2 }),
      ],
    });
    expect(reorderFoodRuleConflict(snapshot, "m2", "m1")?.foodLabel).toBe("Peanuts");
    expect(reorderFoodRuleConflict(house(), "m2", "m1")).toBeNull();
  });

  it("finds a meal from Tuesday or Tue · Oct 6", () => {
    const snapshot = house({
      meals: [meal({ id: "m2", title: "Bowls", dayIndex: 2, nightDate: "2026-10-06" })],
    });
    expect(findMealForDayName(snapshot, "Tuesday")?.id).toBe("m2");
    expect(findMealForDayName(snapshot, "Tue · Oct 6")?.id).toBe("m2");
  });
});

describe("RPC error mapping", () => {
  it("maps lock_week and reorder food-rule errors to the spec strings", () => {
    expect(mapLockWeekError("food_rule_needs_change: Peanuts on night 2")).toBe(LOCK_FOOD_RULE_ERROR);
    expect(mapMealReorderError("food_rule_conflict: Peanuts")).toBe(REORDER_FOOD_RULE_ERROR);
    expect(mapFoodRuleActionError("food_rule_needs_change: Peanuts")).toBe(LOCK_FOOD_RULE_ERROR);
    expect(mapFoodRuleActionError("food_rule_conflict: Peanuts")).toBe(REORDER_FOOD_RULE_ERROR);
    expect(mapFoodRuleActionError("Unlock this week first.")).toBe("Unlock this week first.");
    expect(FOOD_RULE_NEEDS_CHANGE_CODE).toBe("food_rule_needs_change");
    expect(FOOD_RULE_CONFLICT_CODE).toBe("food_rule_conflict");
    expect(REORDER_FOOD_RULE_ERROR).toContain(FOOD_RULE_CONFLICTS.toLowerCase().replace("conflicts", "conflicts"));
    expect(REORDER_FOOD_RULE_ERROR.toLowerCase()).toContain("conflicts with a food rule");
  });
});

describe("conflict UI render", () => {
  it("renders no chips or pills without a snapshot", () => {
    const card = renderToStaticMarkup(
      createElement(BallotCard, {
        dayLabel: "Tue · Oct 6",
        confirmDayLabel: "Tuesday",
        title: "Thai peanut noodle bowls",
        onSwap: () => undefined,
        onRemove: () => undefined,
      }),
    );
    expect(card).not.toContain("food-rule-chip");
    expect(card).not.toContain(FOOD_RULE_NEEDS_CHANGE);
    expect(card).not.toMatch(/iPhone|grandma/i);

    const empty = renderToStaticMarkup(
      createElement(EmptyDayCard, {
        dayLabel: "Tue · Oct 6",
        dayName: "Tuesday",
        state: "empty",
        onAdd: () => undefined,
      }),
    );
    expect(empty).not.toContain("food-rule-heads-up");

    const row = renderToStaticMarkup(
      createElement(ListRow, { name: "peanut sauce", quantity: "1 jar", checked: false, onCheckedChange: () => undefined }),
    );
    expect(row).not.toContain(FOOD_RULE_CHECK_LABEL);

    const recipe = renderToStaticMarkup(
      createElement(RecipeBlock, {
        servings: 4,
        recipe: {
          id: "r",
          mealId: "m",
          servings: 4,
          prepMinutes: 10,
          cookMinutes: 10,
          steps: ["Cook"],
          ingredients: [{ id: "i", name: "peanut sauce", quantity: 1, unit: "jar", storeId: "s" }],
        },
      }),
    );
    expect(recipe).not.toContain("food-rule-hold");
    expect(recipe).toContain("peanut sauce");
  });

  it("renders a night-card allergy chip from the snapshot", () => {
    const snapshot = house({
      foodRules: [
        rule({
          id: "r-peanut",
          foodLabel: "Peanuts",
          severity: "allergy",
          allergenCode: "peanuts",
          subjectEaterId: "e-sam",
        }),
      ],
      meals: [meal({ id: "m2", title: "Thai peanut noodle bowls", dayIndex: 2, nightDate: "2026-10-06" })],
    });
    const html = renderToStaticMarkup(
      createElement(NightCard, {
        meal: snapshot.meals[0]!,
        snapshot,
        membershipId: "mem-alex",
      }),
    );
    expect(html).toContain("food-rule-chip");
    expect(html).toContain("Peanuts · Sam’s allergy");
    expect(html).toContain(FOOD_RULE_NEEDS_CHANGE);
  });
});

describe("no bot wake from conflict UI", () => {
  it("never calls the wake client from the new files", () => {
    const files = [
      "lib/food-rule-check.ts",
      "components/use-food-rule-heads-up.ts",
      "components/ballot-card.tsx",
      "components/night-card.tsx",
      "components/recipe-view.tsx",
      "components/lock-bar.tsx",
      "components/list-row.tsx",
      "components/saved-meals.tsx",
      "components/empty-day-card.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(srcRoot, file), "utf8");
      expect(source).not.toContain("requestBotWake");
      expect(source).not.toContain("wakeWeekOrPlanChange");
      expect(source).not.toContain("bot-wake-client");
    }
  });
});
