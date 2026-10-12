import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyHousehold } from "./seed";
import type { FoodRule, HouseholdEater, RecipeFoodHold, WeekNightAttendee, WeekNightList } from "./types";
import {
  FOOD_RULES_NONE,
  FOOD_RULES_NOT_SET_UP,
  FOOD_RULES_SAFETY,
  LAST_ATTENDEE_PREFIX,
  WHOLE_HOUSE_LABEL,
  applyAckFoodHold,
  applyAddEater,
  applyAddFoodRule,
  applyMarkFoodRulesReviewed,
  applyRemoveEater,
  applyRemoveFoodRule,
  applyRenameEater,
  applySaveWeekPeopleV2,
  applySetNightGuests,
  applyUpdateFoodRule,
  foodRuleAppliesLine,
  foodRulesCountsLine,
  foodRulesPlanningLine,
  groupFoodRules,
  nightPeopleToJson,
  optimisticEater,
  optimisticFoodRule,
  parseFoodRules,
  parseHouseholdEaters,
  parseRecipeFoodHolds,
  parseWeekNightAttendees,
  parseWeekNightLists,
} from "./food-rules";

const srcRoot = path.resolve(import.meta.dirname, "..");

function eater(partial: Partial<HouseholdEater> & Pick<HouseholdEater, "id" | "displayName">): HouseholdEater {
  return {
    householdId: "house",
    createdAt: "2026-10-11T00:00:00.000Z",
    ...partial,
  };
}

function rule(partial: Partial<FoodRule> & Pick<FoodRule, "id" | "foodLabel" | "severity">): FoodRule {
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

describe("food rules copy and grouping", () => {
  it("uses the house-row counts line and never says safe", () => {
    const peanut = rule({ id: "r1", foodLabel: "Peanuts", severity: "allergy" });
    const milk = rule({ id: "r2", foodLabel: "Milk", severity: "intolerance" });
    const onion = rule({ id: "r3", foodLabel: "Onion", severity: "dislike" });
    expect(foodRulesCountsLine([], null)).toBe(FOOD_RULES_NOT_SET_UP);
    expect(foodRulesCountsLine([], "2026-10-11T00:00:00.000Z")).toBe(FOOD_RULES_NONE);
    expect(foodRulesCountsLine([peanut, milk, onion], "2026-10-11T00:00:00.000Z")).toBe(
      "1 allergy \u00b7 1 intolerance \u00b7 1 food to skip",
    );
    expect(foodRulesPlanningLine([peanut, milk, onion])).toBe("Planning around 3 food rules");
    expect(FOOD_RULES_SAFETY.toLowerCase()).not.toMatch(/\bsafe\b/);
    expect(foodRuleAppliesLine(WHOLE_HOUSE_LABEL)).toBe("Applies to every dinner.");
    expect(foodRuleAppliesLine("Sam")).toBe("Applies on the nights Sam is eating.");
  });

  it("groups Whole house first, then members, then named people; allergy first inside a group", () => {
    const memberships = [
      {
        id: "mem-alex",
        householdId: "house",
        userId: "u1",
        role: "owner" as const,
        displayName: "Alex",
        email: "alex@example.com",
      },
    ];
    const eaters = [eater({ id: "e-sam", displayName: "Sam" })];
    const rules = [
      rule({ id: "d", foodLabel: "Onion", severity: "dislike", subjectEaterId: "e-sam" }),
      rule({ id: "a", foodLabel: "Peanuts", severity: "allergy", subjectEaterId: "e-sam" }),
      rule({ id: "h", foodLabel: "Shellfish", severity: "allergy" }),
      rule({ id: "m", foodLabel: "Milk", severity: "intolerance", subjectMembershipId: "mem-alex" }),
    ];
    const groups = groupFoodRules(rules, memberships, eaters);
    expect(groups.map((group) => group.who)).toEqual(["Whole house", "Alex", "Sam"]);
    expect(groups[2]?.rules.map((item) => item.severity)).toEqual(["allergy", "dislike"]);
  });
});

describe("repo mapping", () => {
  it("maps snake_case rows and drops incomplete ones", () => {
    expect(
      parseHouseholdEaters([
        { id: "e1", household_id: "h", display_name: "  Sam  ", created_at: "t" },
        { id: "e2", household_id: "h", display_name: "   " },
      ]),
    ).toEqual([{ id: "e1", householdId: "h", displayName: "Sam", createdAt: "t" }]);

    expect(
      parseFoodRules([
        {
          id: "r1",
          household_id: "h",
          subject_membership_id: null,
          subject_eater_id: "e1",
          food_label: "Peanuts",
          food_key: "peanuts",
          allergen_code: "peanuts",
          severity: "allergy",
          details: "trace",
          created_at: "t0",
          updated_at: "t1",
        },
        { id: "bad", household_id: "h", food_label: "X", severity: "nope" },
      ]),
    ).toEqual([
      {
        id: "r1",
        householdId: "h",
        subjectMembershipId: null,
        subjectEaterId: "e1",
        foodLabel: "Peanuts",
        foodKey: "peanuts",
        allergenCode: "peanuts",
        severity: "allergy",
        details: "trace",
        createdAt: "t0",
        updatedAt: "t1",
      },
    ]);

    expect(
      parseWeekNightLists([{ household_id: "h", week_id: "w", day_index: 2, guests: 1, updated_at: "t" }]),
    ).toEqual([{ householdId: "h", weekId: "w", dayIndex: 2, guests: 1, updatedAt: "t" }]);

    expect(
      parseWeekNightAttendees([
        { id: "a1", household_id: "h", week_id: "w", day_index: 2, membership_id: "m1", eater_id: null },
        { id: "bad", household_id: "h", week_id: "w", day_index: 2, membership_id: "m1", eater_id: "e1" },
      ]),
    ).toEqual([
      { id: "a1", householdId: "h", weekId: "w", dayIndex: 2, membershipId: "m1", eaterId: null },
    ]);

    expect(
      parseRecipeFoodHolds([
        {
          id: "hold",
          household_id: "h",
          recipe_id: "rec",
          rule_id: "r1",
          matched_term: "soy",
          created_at: "t",
          acknowledged_by: null,
          acknowledged_at: null,
        },
      ]),
    ).toEqual([
      {
        id: "hold",
        householdId: "h",
        recipeId: "rec",
        ruleId: "r1",
        matchedTerm: "soy",
        createdAt: "t",
        acknowledgedBy: null,
        acknowledgedAt: null,
      },
    ]);
  });

  it("serializes v2 attendee nights the way the RPC expects", () => {
    expect(
      nightPeopleToJson([
        { dayIndex: 1, everyone: true },
        { dayIndex: 2, membershipIds: ["m1"], eaterIds: ["e1"], guests: 1 },
      ]),
    ).toEqual([
      { day_index: 1, everyone: true },
      { day_index: 2, membership_ids: ["m1"], eater_ids: ["e1"], guests: 1 },
    ]);
  });
});

describe("optimistic reducers", () => {
  it("adds, renames, and removes a named person and their rules", () => {
    const base = emptyHousehold("House A", {
      id: "user-1",
      email: "alex@example.com",
      displayName: "Alex",
    });
    const sam = optimisticEater(base.household.id, "Sam");
    const withSam = applyAddEater(base, sam);
    expect(withSam.eaters.map((row) => row.displayName)).toEqual(["Sam"]);

    const renamed = applyRenameEater(withSam, sam.id, "Robin");
    expect(renamed.eaters[0]?.displayName).toBe("Robin");

    const peanut = optimisticFoodRule(base.household.id, {
      subjectEaterId: sam.id,
      foodLabel: "Peanuts",
      allergenCode: "peanuts",
      severity: "allergy",
    });
    const withRule = applyAddFoodRule(renamed, peanut);
    expect(withRule.foodRules).toHaveLength(1);
    const cleared = applyRemoveEater(withRule, sam.id);
    expect(cleared.eaters).toEqual([]);
    expect(cleared.foodRules).toEqual([]);
  });

  it("blocks removing the only person on a named-list night", () => {
    const base = emptyHousehold("House A");
    const sam = eater({ id: "e-sam", displayName: "Sam", householdId: base.household.id });
    const list: WeekNightList = {
      householdId: base.household.id,
      weekId: base.week.id,
      dayIndex: 1,
      guests: 0,
      updatedAt: "t",
    };
    const attendee: WeekNightAttendee = {
      id: "a1",
      householdId: base.household.id,
      weekId: base.week.id,
      dayIndex: 1,
      membershipId: null,
      eaterId: sam.id,
    };
    expect(() =>
      applyRemoveEater({ ...base, eaters: [sam], nightLists: [list], nightAttendees: [attendee] }, sam.id),
    ).toThrow(LAST_ATTENDEE_PREFIX);
  });

  it("updates and removes a rule, acks a hold, and marks reviewed", () => {
    const base = emptyHousehold("House A");
    const peanut = optimisticFoodRule(base.household.id, {
      foodLabel: "Peanuts",
      allergenCode: "peanuts",
      severity: "allergy",
    });
    const withRule = applyAddFoodRule(base, peanut);
    const updated = applyUpdateFoodRule(withRule, peanut.id, { details: "traces too" });
    expect(updated.foodRules[0]?.details).toBe("traces too");

    const hold: RecipeFoodHold = {
      id: "hold-1",
      householdId: base.household.id,
      recipeId: "rec-1",
      ruleId: peanut.id,
      matchedTerm: "peanut",
      createdAt: "t",
      acknowledgedBy: null,
      acknowledgedAt: null,
    };
    const held = { ...updated, foodHolds: [hold] };
    const acked = applyAckFoodHold(held, hold.id, {
      acknowledgedBy: "user-1",
      acknowledgedAt: "2026-10-12T00:00:00.000Z",
    });
    expect(acked.foodHolds[0]?.acknowledgedAt).toBe("2026-10-12T00:00:00.000Z");

    const reviewed = applyMarkFoodRulesReviewed(acked, "2026-10-12T00:00:00.000Z");
    expect(reviewed.household.foodRulesReviewedAt).toBe("2026-10-12T00:00:00.000Z");

    const removed = applyRemoveFoodRule(reviewed, peanut.id);
    expect(removed.foodRules).toEqual([]);
    expect(removed.foodHolds).toEqual([]);
  });

  it("saves a named-list night as people + guests and Everyone as a free plate count", () => {
    const base = emptyHousehold("House A");
    const cooking = {
      ...base,
      week: { ...base.week, nightHeadcounts: [4, 4, 4, 4, 4, 2, 2] },
    };
    const named = applySaveWeekPeopleV2(
      cooking,
      cooking.week.id,
      [4, 4, 4, 4, 4, 2, 2],
      null,
      [{ dayIndex: 1, membershipIds: ["m1"], eaterIds: ["e1"], guests: 1 }],
    );
    expect(named.week.nightHeadcounts?.[1]).toBe(3);
    expect(named.nightLists).toEqual([
      expect.objectContaining({ weekId: cooking.week.id, dayIndex: 1, guests: 1 }),
    ]);
    expect(named.nightAttendees).toHaveLength(2);

    const everyone = applySaveWeekPeopleV2(named, cooking.week.id, [4, 4, 4, 4, 4, 2, 2], null, [
      { dayIndex: 1, everyone: true },
    ]);
    expect(everyone.week.nightHeadcounts?.[1]).toBe(4);
    expect(everyone.nightLists).toEqual([]);
    expect(everyone.nightAttendees).toEqual([]);

    const guests = applySetNightGuests(named, cooking.week.id, 1, 3);
    expect(guests.nightLists[0]?.guests).toBe(3);
    expect(guests.week.nightHeadcounts?.[1]).toBe(5);
  });
});

describe("provider wiring", () => {
  it("exposes the new actions and never wakes the bot from them", () => {
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");
    const repo = readFileSync(path.join(srcRoot, "lib/supabase/repo.ts"), "utf8");
    const start = provider.indexOf("addEater: (displayName)");
    const block = provider.slice(start, provider.indexOf("// refresh/run close", start));

    expect(block).toContain("supabaseAddEater");
    expect(block).toContain("supabaseRenameEater");
    expect(block).toContain("supabaseRemoveEater");
    expect(block).toContain("supabaseAddFoodRule");
    expect(block).toContain("supabaseUpdateFoodRule");
    expect(block).toContain("supabaseRemoveFoodRule");
    expect(block).toContain("supabaseMarkFoodRulesReviewed");
    expect(block).toContain("supabaseSaveWeekPeopleV2");
    expect(block).toContain("supabaseSavePlanningPeopleV2");
    expect(block).toContain("supabaseSetNightGuests");
    expect(block).toContain("supabaseAckFoodHold");
    expect(block).not.toContain("wakeWeekOrPlanChange");
    expect(block).not.toContain("requestBotWake");
    expect(repo).toContain("save_week_people_v2");
    expect(repo).toContain("save_planning_people_v2");
    expect(repo).toContain("set_night_guests");
    expect(repo).toContain("ack_recipe_food_hold");
    expect(repo).toContain("set_food_rules_reviewed");
    expect(repo).not.toMatch(/supabaseAddEater[\s\S]*requestBotWake/);
    expect(repo).toContain("session.householdId");
    expect(provider).toContain("liveRealtimeTables(foodRulesLive)");
    expect(provider).not.toContain("FOOD_RULES_REALTIME_TABLES");
  });
});
