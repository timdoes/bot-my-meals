import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddNameInline } from "@/components/food-rules/add-name-inline";
import { allergenCodeForLabel, FoodPicker } from "@/components/food-rules/food-picker";
import { FoodRulesHome } from "@/components/food-rules/food-rules-home";
import { PeopleAtTheTable } from "@/components/food-rules/people-at-the-table";
import { PersonChips } from "@/components/food-rules/person-chips";
import { RemoveAllergyBody } from "@/components/food-rules/remove-allergy-dialog";
import { RemovePersonBody } from "@/components/food-rules/remove-person-dialog";
import {
  ADD_ALLERGY_LABEL,
  ADD_FOOD_TO_SKIP_LABEL,
  EATER_CHANGE_LINE,
  EMPTY_RULES_BODY,
  EMPTY_RULES_TITLE,
  FOOD_RULES_SAFETY_CARD,
  FOOD_RULES_SAFETY_SHORT,
  foodRulesHouseRowLine,
  MEALS_SECTION_HELPER,
  MEALS_SECTION_TITLE,
  PEOPLE_EATER_FOOTNOTE,
  PEOPLE_HELPER,
  REMOVE_ALLERGY_TITLE,
  removeAllergyBody,
} from "@/components/food-rules/copy";
import { LAST_ATTENDEE_ERROR, PEOPLE_AT_THE_TABLE, WHOLE_HOUSE_LABEL } from "@/lib/food-rules";
import { NEVER_AGAIN_EMPTY } from "@/lib/meal-dislikes";
import type { FoodRule, HouseholdEater, MealDislike, Membership } from "@/lib/types";

const srcRoot = path.resolve(import.meta.dirname, "..");

function member(partial: Partial<Membership> & Pick<Membership, "id" | "displayName" | "role">): Membership {
  return {
    householdId: "house",
    userId: `user-${partial.id}`,
    email: `${partial.displayName.toLowerCase()}@example.com`,
    ...partial,
  };
}

function eater(partial: Partial<HouseholdEater> & Pick<HouseholdEater, "id" | "displayName">): HouseholdEater {
  return {
    householdId: "house",
    createdAt: "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function rule(
  partial: Partial<FoodRule> & Pick<FoodRule, "id" | "foodLabel" | "severity">,
): FoodRule {
  return {
    householdId: "house",
    subjectMembershipId: null,
    subjectEaterId: null,
    foodKey: partial.foodLabel.toLowerCase(),
    allergenCode: null,
    details: "",
    createdAt: "2026-10-11T00:00:00.000Z",
    updatedAt: "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function dislike(title: string, recipeKey = title.toLowerCase()): MealDislike {
  return {
    id: recipeKey,
    householdId: "house",
    recipeKey,
    title,
    neverAgain: true,
    note: "",
    updatedAt: "2026-10-11T00:00:00.000Z",
  };
}

const alex = member({ id: "mem-alex", displayName: "Alex", role: "owner" });
const sam = eater({ id: "e-sam", displayName: "Sam" });
const peanut = rule({
  id: "r-peanut",
  foodLabel: "Peanuts",
  severity: "allergy",
  subjectEaterId: "e-sam",
  allergenCode: "peanuts",
});
const shellfish = rule({
  id: "r-shell",
  foodLabel: "Shellfish",
  severity: "allergy",
  subjectEaterId: "e-sam",
  allergenCode: "shellfish",
});
const dairy = rule({
  id: "r-dairy",
  foodLabel: "Dairy",
  severity: "intolerance",
  subjectMembershipId: "mem-alex",
  allergenCode: "milk",
});
const mushrooms = rule({ id: "r-mush", foodLabel: "Mushrooms", severity: "dislike" });

const noop = () => undefined;

describe("device-neutral copy", () => {
  it("keeps spec strings free of tap/click/iPhone/grandma", () => {
    const copy = readFileSync(path.join(srcRoot, "components/food-rules/copy.ts"), "utf8");
    expect(copy).not.toMatch(/\btap\b/i);
    expect(copy).not.toMatch(/\bclick\b/i);
    expect(copy).not.toMatch(/\biPhone\b/i);
    expect(copy).not.toMatch(/grandma/i);
  });
});

describe("food rules house row counts", () => {
  it("matches spec §4.2: allergies, foods, meals; omit zeros; Not set up until reviewed", () => {
    expect(foodRulesHouseRowLine([], null, 0)).toBe("Not set up");
    expect(foodRulesHouseRowLine([], "2026-10-11T00:00:00.000Z", 0)).toBe(
      "No allergies or foods to skip",
    );
    expect(foodRulesHouseRowLine([peanut, shellfish, dairy, mushrooms], "2026-10-11T00:00:00.000Z", 3)).toBe(
      "2 allergies \u00b7 2 foods \u00b7 3 meals",
    );
    expect(foodRulesHouseRowLine([peanut], "2026-10-11T00:00:00.000Z", 1)).toBe("1 allergy \u00b7 1 meal");
  });
});

describe("Food rules home SSR", () => {
  it("shows the empty nudge before review and the reviewed-none line after", () => {
    const neverReviewed = renderToStaticMarkup(
      createElement(FoodRulesHome, {
        rules: [],
        eaters: [sam],
        memberships: [alex],
        mealDislikes: [],
        reviewedAt: null,
        canAct: true,
        onAddRule: noop,
        onUpdateRule: noop,
        onRemoveRule: noop,
        onAddEater: noop,
        onRenameEater: noop,
        onRemoveEater: noop,
        onAllowMeal: noop,
      }),
    );
    expect(neverReviewed).toContain(EMPTY_RULES_TITLE);
    expect(neverReviewed).toContain(EMPTY_RULES_BODY);
    expect(neverReviewed).toContain(ADD_ALLERGY_LABEL);
    expect(neverReviewed).toContain(ADD_FOOD_TO_SKIP_LABEL);
    expect(neverReviewed).toContain(FOOD_RULES_SAFETY_CARD);
    expect(neverReviewed).toContain(MEALS_SECTION_TITLE);
    expect(neverReviewed).toContain(MEALS_SECTION_HELPER);
    expect(neverReviewed).toContain(NEVER_AGAIN_EMPTY);
    expect(neverReviewed).toContain(PEOPLE_AT_THE_TABLE);
    expect(neverReviewed).toContain(PEOPLE_HELPER);
    expect(neverReviewed).not.toMatch(/\biPhone\b/i);
    expect(neverReviewed).not.toMatch(/grandma/i);

    const reviewedNone = renderToStaticMarkup(
      createElement(FoodRulesHome, {
        rules: [],
        eaters: [],
        memberships: [alex],
        mealDislikes: [],
        reviewedAt: "2026-10-11T00:00:00.000Z",
        canAct: true,
        onAddRule: noop,
        onUpdateRule: noop,
        onRemoveRule: noop,
        onAddEater: noop,
        onRenameEater: noop,
        onRemoveEater: noop,
        onAllowMeal: noop,
      }),
    );
    expect(reviewedNone).toContain("No allergies or foods to skip");
    expect(reviewedNone).toContain("Add one");
  });

  it("groups rules and unions Never again meals", () => {
    const html = renderToStaticMarkup(
      createElement(FoodRulesHome, {
        rules: [peanut, shellfish, dairy, mushrooms],
        eaters: [sam],
        memberships: [alex],
        mealDislikes: [
          dislike("Tuna noodle casserole", "tuna"),
          dislike("Baked ziti", "ziti"),
          dislike("Mushroom risotto", "risotto"),
        ],
        reviewedAt: "2026-10-11T00:00:00.000Z",
        canAct: true,
        onAddRule: noop,
        onUpdateRule: noop,
        onRemoveRule: noop,
        onAddEater: noop,
        onRenameEater: noop,
        onRemoveEater: noop,
        onAllowMeal: async () => undefined,
      }),
    );
    expect(html).toContain(WHOLE_HOUSE_LABEL);
    expect(html).toContain("Sam");
    expect(html).toContain("Alex");
    expect(html).toContain("Peanuts");
    expect(html).toContain("Shellfish");
    expect(html).toContain("Dairy");
    expect(html).toContain("Mushrooms");
    expect(html).toContain("Tuna noodle casserole");
    expect(html).toContain("Allow again");
    expect(html).toContain("3 meals");
  });

  it("keeps Eaters read-only", () => {
    const html = renderToStaticMarkup(
      createElement(FoodRulesHome, {
        rules: [peanut],
        eaters: [sam],
        memberships: [alex],
        mealDislikes: [dislike("Chili")],
        reviewedAt: "2026-10-11T00:00:00.000Z",
        canAct: false,
        onAddRule: noop,
        onUpdateRule: noop,
        onRemoveRule: noop,
        onAddEater: noop,
        onRenameEater: noop,
        onRemoveEater: noop,
        onAllowMeal: async () => undefined,
      }),
    );
    expect(html).toContain(EATER_CHANGE_LINE);
    expect(html).not.toContain(ADD_ALLERGY_LABEL);
    expect(html).not.toContain(ADD_FOOD_TO_SKIP_LABEL);
    expect(html).not.toContain("Allow again");
    expect(html).not.toContain(">Rename<");
    expect(html).toContain(PEOPLE_EATER_FOOTNOTE);
  });
});

describe("shared pickers B and D import", () => {
  it("renders FoodPicker, PersonChips, and AddNameInline", () => {
    const picker = renderToStaticMarkup(
      createElement(FoodPicker, {
        value: "Sesame",
        allergenCode: "sesame",
        onChange: noop,
      }),
    );
    expect(picker).toContain("Milk");
    expect(picker).toContain("Sesame");
    expect(picker).toContain('aria-checked="true"');
    expect(allergenCodeForLabel("peanut butter")).toBe("peanuts");
    expect(allergenCodeForLabel("butternut")).toBeNull();

    const chips = renderToStaticMarkup(
      createElement(PersonChips, {
        memberships: [alex],
        eaters: [sam],
        selected: { kind: "named", eaterId: "e-sam" },
        onSelect: noop,
        onAddName: noop,
      }),
    );
    expect(chips).toContain(WHOLE_HOUSE_LABEL);
    expect(chips).toContain("Alex");
    expect(chips).toContain("Sam");
    expect(chips).toContain("+ Add a name");
    expect(chips).toContain('data-person="named:e-sam"');

    const add = renderToStaticMarkup(
      createElement(AddNameInline, { existing: [sam], onAdd: noop }),
    );
    expect(add).toContain("+ Add a name");
    expect(add).not.toMatch(/\btap\b/i);
  });
});

describe("removal confirms", () => {
  it("uses the allergy confirm copy", () => {
    const html = renderToStaticMarkup(
      createElement(RemoveAllergyBody, {
        food: "Peanuts",
        onKeep: noop,
        onRemove: noop,
      }),
    );
    expect(html).toContain(REMOVE_ALLERGY_TITLE);
    expect(html).toContain(removeAllergyBody("Peanuts"));
    expect(html).toContain("Keep");
    expect(html).toContain("Remove");
  });

  it("lists the named person\u2019s rules and last_attendee text", () => {
    const html = renderToStaticMarkup(
      createElement(RemovePersonBody, {
        name: "Sam",
        foods: ["Peanuts", "Shellfish"],
        lastAttendee: true,
        onKeep: noop,
        onRemove: noop,
      }),
    );
    expect(html).toContain("Remove Sam?");
    expect(html).toContain("Their food rules go too: Peanuts and Shellfish.");
    expect(html).toContain("Sam also comes off any night they\u2019re listed. Plates stay as they are.");
    expect(html).toContain(LAST_ATTENDEE_ERROR);
    expect(html).toContain("Keep Sam");
    expect(html).toContain("Remove Sam");
    expect(html).toContain('data-slot="last-attendee-error"');
  });

  it("omits the rules sentence when the person has none", () => {
    const html = renderToStaticMarkup(
      createElement(RemovePersonBody, {
        name: "Sam",
        foods: [],
        onKeep: noop,
        onRemove: noop,
      }),
    );
    expect(html).not.toContain("Their food rules go too");
  });
});

describe("People at the table SSR", () => {
  it("shows signed-in vs name-only rows", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleAtTheTable, {
        memberships: [alex],
        eaters: [sam],
        rules: [peanut, shellfish],
        sessionMembershipId: "mem-alex",
        canAct: true,
        onAddName: noop,
        onRename: noop,
        onRemove: noop,
      }),
    );
    expect(html).toContain("Alex");
    expect(html).toContain("You");
    expect(html).toContain("Signs in");
    expect(html).toContain("Admin");
    expect(html).toContain("Sam");
    expect(html).toContain("Name only");
    expect(html).toContain("2 food rules");
    expect(html).toContain("Rename");
  });
});

describe("live-safety and wiring", () => {
  it("hides the Food rules House row and never-again redirect until the snapshot proves the tables exist", () => {
    const house = readFileSync(path.join(srcRoot, "app/house/page.tsx"), "utf8");
    const neverAgain = readFileSync(path.join(srcRoot, "app/house/never-again/page.tsx"), "utf8");
    const foodRulesPage = readFileSync(path.join(srcRoot, "app/house/food-rules/page.tsx"), "utf8");

    expect(house).toContain("isFoodRulesAvailable()");
    expect(house).toContain('data-slot="food-rules-house-row"');
    expect(house).toContain('data-slot="never-again-house-row"');
    expect(house).toContain("NEVER_AGAIN_LIST_LABEL");
    expect(house).toContain("/house/food-rules");
    expect(house).toContain("/house/never-again");

    expect(neverAgain).toContain("isFoodRulesAvailable()");
    expect(neverAgain).toContain('router.replace("/house/food-rules#meals")');
    expect(neverAgain).toContain("NeverAgainList");
    expect(neverAgain).toContain("if (snapshot && available)");

    expect(foodRulesPage).toContain("isFoodRulesAvailable()");
    expect(foodRulesPage).toContain('router.replace("/house")');
    expect(foodRulesPage).toContain("if (snapshot && !available)");
  });

  it("never wakes the bot from rule or named-person edits", () => {
    const owned = [
      "app/house/food-rules/page.tsx",
      "app/house/never-again/page.tsx",
      "app/house/page.tsx",
      "components/never-again-list.tsx",
      "components/food-rules/food-rules-home.tsx",
      "components/food-rules/food-rule-sheet.tsx",
      "components/food-rules/people-at-the-table.tsx",
      "components/food-rules/add-name-inline.tsx",
    ];
    for (const rel of owned) {
      const source = readFileSync(path.join(srcRoot, rel), "utf8");
      expect(source).not.toContain("wakeWeekOrPlanChange");
      expect(source).not.toContain("requestBotWake");
      expect(source).not.toMatch(/\biPhone\b/);
      expect(source).not.toMatch(/grandma/i);
    }
  });

  it("exports the four components B and D import", () => {
    const barrel = readFileSync(path.join(srcRoot, "components/food-rules/index.ts"), "utf8");
    expect(barrel).toContain("export { FoodRuleSheet }");
    expect(barrel).toContain("export { FoodPicker");
    expect(barrel).toContain("export { PersonChips");
    expect(barrel).toContain("export { AddNameInline }");
  });

  it("reuses Never again as the Meals section only", () => {
    const home = readFileSync(path.join(srcRoot, "components/food-rules/food-rules-home.tsx"), "utf8");
    expect(home).toContain("NeverAgainList");
    expect(home).toContain('id="meals"');
    expect(FOOD_RULES_SAFETY_SHORT).toContain("Check labels");
  });
});
