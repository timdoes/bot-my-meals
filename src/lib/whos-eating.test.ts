import { HOUSEHOLD_EATERS_MAX, validateEaterName } from "@/lib/food-rules";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanningPeopleGate } from "@/components/planning-people-gate";
import { EmptyDayCard } from "@/components/empty-day-card";
import { FoodRulesCoverageRow, TakeOffConfirmBody, WhosEatingRow } from "@/components/whos-eating-sheet";
import type { FoodRule, Household, HouseholdEater, Membership, WeekNightAttendee, WeekNightList } from "./types";
import {
  allergyConfirmsOnRemove,
  applyChipToggle,
  applyNamedListStepper,
  draftsFromSnapshot,
  firstTimeGuests,
  footerPeoplePlatesLine,
  namedListForRequest,
  namedListPlates,
  nightPeopleInputs,
  planningAroundRules,
  sameNightCounts,
  selectedNames,
  showWhosEatingFeature,
  showWhosEatingRow,
  tablePeople,
  takeOffBody,
  takeOffMealHitBody,
  takeOffTitle,
  weekCoverageRuleIds,
  whosEatingNamesLine,
  whosEatingRowAria,
  whosEatingRowLabel,
  whosEatingSheetTitle,
  WHOS_EATING_CROSS_CONTACT,
  WHOS_EATING_EATER_READONLY,
  WHOS_EATING_HELPER,
  WHOS_EATING_KEEP,
  WHOS_EATING_NEED_PERSON,
  WHOS_EATING_STEPPER_FLOOR,
  WHOS_EATING_TAKE_OFF,
  everyoneDraft,
  namedDraft,
} from "./whos-eating";

const srcRoot = path.resolve(import.meta.dirname, "..");

function household(): Household {
  return {
    id: "house",
    name: "Our house",
    inviteCode: "code",
    weekStartsOn: 0,
    coupleNights: [1, 2],
    familySize: 4,
    coupleSize: 2,
    nightHeadcounts: [0, 4, 2, 3, 4, 0, 0],
    timezone: "America/Denver",
    setupStep: 8,
    weeklyBudgetCents: null,
    householdSize: 4,
    nightsPlanned: 4,
    postalCode: null,
    botCheckMode: "adaptive",
    botCheckIntervalHours: null,
    foodRulesReviewedAt: "2026-10-11T00:00:00.000Z",
  };
}

const members: Membership[] = [
  { id: "m-tim", householdId: "h", userId: "u1", role: "owner", displayName: "Tim", email: "tim@example.com" },
  { id: "m-rose", householdId: "h", userId: "u2", role: "voter", displayName: "Rose", email: "rose@example.com" },
];
const eaters: HouseholdEater[] = [
  { id: "e-sam", householdId: "h", displayName: "Sam", createdAt: "t" },
  { id: "e-alex", householdId: "h", displayName: "Alex", createdAt: "t" },
];
const people = tablePeople(members, eaters);

function allergy(id: string, food: string, who: { membershipId?: string; eaterId?: string }): FoodRule {
  return {
    id,
    householdId: "h",
    subjectMembershipId: who.membershipId ?? null,
    subjectEaterId: who.eaterId ?? null,
    foodLabel: food,
    foodKey: food.toLowerCase(),
    allergenCode: food.toLowerCase() === "peanuts" ? "peanuts" : food.toLowerCase() === "shellfish" ? "shellfish" : null,
    severity: "allergy",
    details: "",
    createdAt: "t",
    updatedAt: "t",
  };
}

describe("who's eating live-safety and hide rules", () => {
  it("hides the feature when tables are absent, the house has no named people, or only one person", () => {
    expect(showWhosEatingFeature({ schemaReady: false, eaters, memberships: members })).toBe(false);
    expect(showWhosEatingFeature({ schemaReady: true, eaters: [], memberships: members })).toBe(false);
    expect(showWhosEatingFeature({ schemaReady: true, eaters: [eaters[0]!], memberships: [] })).toBe(false);
    expect(showWhosEatingFeature({ schemaReady: true, eaters, memberships: members })).toBe(true);
    expect(showWhosEatingRow(true, 0)).toBe(false);
    expect(showWhosEatingRow(true, 2, true)).toBe(false);
    expect(showWhosEatingRow(true, 2)).toBe(true);
    expect(showWhosEatingRow(false, 4)).toBe(false);
  });
});

describe("who's eating row strings and plates", () => {
  it("formats Everyone, three names, and +N without a count", () => {
    expect(whosEatingNamesLine([], true)).toBe("Everyone");
    expect(whosEatingNamesLine(["Tim", "Rose"], false)).toBe("Tim, Rose");
    expect(whosEatingNamesLine(["Tim", "Rose", "Alex"], false)).toBe("Tim, Rose, Alex");
    expect(whosEatingNamesLine(["Tim", "Rose", "Alex", "Sam"], false)).toBe("Tim, Rose +2");
    expect(whosEatingRowLabel(["Tim", "Rose"], false)).toBe("Who's eating: Tim, Rose");
    expect(whosEatingRowAria("Tuesday", ["Tim", "Rose"], false)).toBe(
      "Who's eating Tuesday: Tim, Rose. Opens a list.",
    );
    expect(whosEatingSheetTitle("Tuesday")).toBe("Who's eating Tuesday?");
    expect(planningAroundRules(1)).toBe("Planning around 1 rule");
    expect(planningAroundRules(2)).toBe("Planning around 2 rules");
  });

  it("derives named-list plates as people + guests and keeps Everyone free", () => {
    expect(firstTimeGuests(6, 4)).toBe(2);
    expect(firstTimeGuests(2, 4)).toBe(0);
    expect(namedListPlates(3, 1)).toBe(4);
    const custom = applyChipToggle(everyoneDraft(people), people[3]!, people.length, 4);
    expect(custom.everyone).toBe(false);
    expect(custom.eaterIds).not.toContain("e-alex");
    expect(custom.guests).toBe(0);
    expect(namedListPlates(selectedNames(custom, people).length, custom.guests)).toBe(3);
    const stepped = applyNamedListStepper(custom, people.length, 4);
    expect(stepped.draft.guests).toBe(1);
    expect(stepped.plates).toBe(4);
    const off = applyNamedListStepper(custom, people.length, 0);
    expect(off.plates).toBe(0);
    expect(off.draft.everyone).toBe(true);
  });

  it("disables Done at zero people and confirms taking an allergic person off", () => {
    expect(WHOS_EATING_NEED_PERSON).toContain("Pick at least one person");
    const previous = everyoneDraft(people);
    const next = namedDraft(["m-tim", "m-rose", "e-alex"], [], 0);
    const confirms = allergyConfirmsOnRemove({
      previous,
      next,
      people,
      rules: [
        allergy("r1", "Peanuts", { eaterId: "e-sam" }),
        allergy("r2", "Shellfish", { eaterId: "e-sam" }),
      ],
      weekday: "Tuesday",
    });
    expect(confirms).toHaveLength(1);
    expect(confirms[0]?.name).toBe("Sam");
    expect(takeOffTitle("Sam", "Tuesday")).toBe("Take Sam off Tuesday?");
    expect(takeOffBody("Sam", "Tuesday", ["Peanuts", "Shellfish"])).toContain(
      "Peanuts and Shellfish (allergies)",
    );
    expect(takeOffMealHitBody("Sam", "Tuesday", "Peanuts", "peanut")).toBe(
      "Sam has a peanut allergy and this dinner has peanut. Take Sam off Tuesday?",
    );
    expect(WHOS_EATING_CROSS_CONTACT).toContain("Whole house rules still apply");
    expect(allergyConfirmsOnRemove({
      previous,
      next,
      people,
      rules: [{ ...allergy("r3", "Mushrooms", { eaterId: "e-sam" }), severity: "dislike" }],
      weekday: "Tuesday",
    })).toEqual([]);
  });

  it("renders a centered Keep / Take off dialog with the generic draft string", () => {
    const html = renderToStaticMarkup(
      createElement(TakeOffConfirmBody, {
        name: "Sam",
        weekday: "Tuesday",
        allergyFoods: ["Peanuts", "Shellfish"],
        mealHitFood: null,
        onKeep: () => undefined,
        onTakeOff: () => undefined,
      }),
    );
    expect(html).toContain('data-slot="whos-eating-take-off"');
    expect(html).toContain("Take Sam off Tuesday?");
    expect(html).toContain("Sam has food rules: Peanuts and Shellfish (allergies).");
    expect(html).toContain("those rules stop applying");
    expect(html).toContain(WHOS_EATING_CROSS_CONTACT);
    expect(html).toContain(WHOS_EATING_KEEP);
    expect(html).toContain(WHOS_EATING_TAKE_OFF);
    expect(html.toLowerCase()).not.toContain("tap ");
    expect(html.toLowerCase()).not.toContain("click ");
    expect(html.toLowerCase()).not.toContain("iphone");
    expect(html.toLowerCase()).not.toContain("grandma");
  });

  it("uses the meal-hit confirm when the dinner text matches the allergy", () => {
    const confirms = allergyConfirmsOnRemove({
      previous: everyoneDraft(people),
      next: namedDraft(["m-tim"], [], 0),
      people,
      rules: [allergy("r1", "Peanuts", { eaterId: "e-sam" })],
      weekday: "Tuesday",
      mealText: "Thai peanut noodles",
    });
    expect(confirms[0]?.mealHitFood).toBeTruthy();
    expect(
      takeOffMealHitBody(
        "Sam",
        "Tuesday",
        confirms[0]?.allergyFoods[0] ?? "Peanuts",
        confirms[0]?.mealHitFood ?? "peanut",
      ),
    ).toContain("peanut allergy");
    const html = renderToStaticMarkup(
      createElement(TakeOffConfirmBody, {
        name: "Sam",
        weekday: "Tuesday",
        allergyFoods: confirms[0]?.allergyFoods ?? ["Peanuts"],
        mealHitFood: confirms[0]?.mealHitFood ?? "peanut",
        onKeep: () => undefined,
        onTakeOff: () => undefined,
      }),
    );
    expect(html).toContain("Sam has a peanut allergy and this dinner has peanut. Take Sam off Tuesday?");
    expect(html).toContain(WHOS_EATING_KEEP);
    expect(html).toContain(WHOS_EATING_TAKE_OFF);
    expect(html).not.toContain("Sam has food rules:");
  });

  it("validates + Name with lock strings and a floor of one attendee on save", () => {
    expect(validateEaterName("Sam", eaters, undefined, members.map((m) => m.displayName))).toBe("That name is already at the table.");
    expect(validateEaterName("Maya", eaters, undefined, members.map((m) => m.displayName))).toBeNull();
    expect(validateEaterName("x".repeat(41), eaters)).toBe("Use a name of 40 characters or fewer.");
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      id: `e-${index}`,
      householdId: "h",
      displayName: `Kid ${index}`,
      createdAt: "t",
    }));
    expect(twelve).toHaveLength(HOUSEHOLD_EATERS_MAX);
    const inputs = nightPeopleInputs(
      [namedDraft([], [], 2), everyoneDraft(people)],
      [3, 4],
      people.length,
    );
    expect(inputs[0]).toEqual({ dayIndex: 0, everyone: true });
    expect(inputs[1]).toEqual({ dayIndex: 1, everyone: true });
    expect(
      nightPeopleInputs([namedDraft(["m-tim", "m-rose"], [], 1)], [3], people.length)[0],
    ).toEqual({
      dayIndex: 0,
      membershipIds: ["m-tim", "m-rose"],
      eaterIds: [],
      guests: 1,
    });
  });

  it("counts week coverage from in-scope rules on dinner nights", () => {
    const house = allergy("h1", "Mushrooms", {});
    const sam = allergy("s1", "Peanuts", { eaterId: "e-sam" });
    const ids = weekCoverageRuleIds({
      counts: [0, 4, 2],
      drafts: [everyoneDraft(people), everyoneDraft(people), namedDraft(["m-tim"], [], 0)],
      rules: [house, sam],
      houseCount: people.length,
    });
    expect(ids).toContain("h1");
    expect(ids).toContain("s1");
  });

  it("looks up a Request-dinner named list and stays hidden without named people", () => {
    const lists: WeekNightList[] = [
      { householdId: "h", weekId: "w", dayIndex: 2, guests: 1, updatedAt: "t" },
    ];
    const attendees: WeekNightAttendee[] = [
      { id: "a1", householdId: "h", weekId: "w", dayIndex: 2, membershipId: "m-tim", eaterId: null },
      { id: "a2", householdId: "h", weekId: "w", dayIndex: 2, membershipId: "m-rose", eaterId: null },
    ];
    expect(
      namedListForRequest({
        schemaReady: true,
        snapshot: { nightLists: lists, nightAttendees: attendees, eaters },
        weekId: "w",
        dayName: "Tuesday",
      }),
    ).toEqual({ weekId: "w", dayIndex: 2, peopleCount: 2, guests: 1 });
    expect(
      namedListForRequest({
        schemaReady: false,
        snapshot: { nightLists: lists, nightAttendees: attendees, eaters },
        weekId: "w",
        dayName: "Tuesday",
      }),
    ).toBeNull();
    expect(
      namedListForRequest({
        schemaReady: true,
        snapshot: { nightLists: lists, nightAttendees: attendees, eaters: [] },
        weekId: "w",
        dayName: "Tuesday",
      }),
    ).toBeNull();
  });

  it("keeps Everyone footer free and uses people + guests on a named list", () => {
    expect(footerPeoplePlatesLine({ everyone: true, people: 4, guests: 0, plates: 2 })).toBe(
      "Everyone · 2 plates",
    );
    expect(footerPeoplePlatesLine({ everyone: true, people: 4, guests: 0, plates: 4 })).toBe(
      "4 people · 4 plates",
    );
    expect(footerPeoplePlatesLine({ everyone: false, people: 3, guests: 1, plates: 4 })).toBe(
      "3 people + 1 guest · 4 plates",
    );
    expect(footerPeoplePlatesLine({ everyone: false, people: 1, guests: 0, plates: 1 })).toBe(
      "1 person · 1 plate",
    );
  });

  it("reads saved lists back into drafts", () => {
    const drafts = draftsFromSnapshot({
      weekId: "w",
      people,
      lists: [{ householdId: "h", weekId: "w", dayIndex: 2, guests: 1, updatedAt: "t" }],
      attendees: [
        { id: "a1", householdId: "h", weekId: "w", dayIndex: 2, membershipId: "m-tim", eaterId: null },
        { id: "a2", householdId: "h", weekId: "w", dayIndex: 2, membershipId: "m-rose", eaterId: null },
      ],
      counts: [0, 4, 3, 4, 4, 0, 0],
    });
    expect(drafts[1]?.everyone).toBe(true);
    expect(drafts[2]?.everyone).toBe(false);
    expect(drafts[2]?.membershipIds).toEqual(["m-tim", "m-rose"]);
    expect(drafts[2]?.guests).toBe(1);
    expect(sameNightCounts([4, 4], [4, 4])).toBe(true);
    expect(sameNightCounts([4, 4], [4, 3])).toBe(false);
  });
});

describe("who's eating UI", () => {
  it("renders the row and coverage copy from the lock", () => {
    const row = renderToStaticMarkup(
      createElement(WhosEatingRow, {
        weekday: "Tuesday",
        names: ["Tim", "Rose"],
        everyone: false,
        rulesCount: 1,
        onOpen: () => undefined,
      }),
    );
    expect(row).toContain('data-slot="whos-eating-row"');
    expect(row).toContain("Who&#x27;s eating: Tim, Rose");
    expect(row).toContain("Planning around 1 rule");
    expect(row).toContain("Who&#x27;s eating Tuesday: Tim, Rose. Opens a list.");
    const coverage = renderToStaticMarkup(
      createElement(FoodRulesCoverageRow, { reviewedAt: "t", ruleCount: 4 }),
    );
    expect(coverage).toContain("Planning around 4 food rules");
    expect(coverage).toContain("View");
    expect(coverage).toContain("/house/food-rules");
  });

  it("keeps the planning gate identical when the feature is hidden", () => {
    const html = renderToStaticMarkup(
      createElement(PlanningPeopleGate, {
        household: household(),
        canEdit: true,
        onSave: async () => undefined,
        onBack: () => undefined,
      }),
    );
    expect(html).toContain('data-slot="planning-people-gate"');
    expect(html).toContain('data-slot="people-per-night"');
    expect(html).not.toContain('data-slot="whos-eating-row"');
    expect(html).not.toContain('data-slot="food-rules-coverage"');
    expect(html).not.toContain(WHOS_EATING_HELPER);
    expect(html.toLowerCase()).not.toContain("tap ");
    expect(html.toLowerCase()).not.toContain("click ");
    expect(html.toLowerCase()).not.toContain("iphone");
    expect(html.toLowerCase()).not.toContain("grandma");
  });

  it("renders EmptyDayCard without a named-list guests stepper when tables are absent", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyDayCard, {
        dayLabel: "Tue 7",
        dayName: "Tuesday",
        state: "empty",
        servings: 4,
        onAdd: () => undefined,
      }),
    );
    expect(html).toContain('data-slot="empty-day-card"');
    expect(html).not.toContain('data-mode="guests"');
    expect(html).not.toContain(WHOS_EATING_STEPPER_FLOOR);
  });
});

describe("who's eating wiring and no-wake", () => {
  const gate = readFileSync(path.join(srcRoot, "components/planning-people-gate.tsx"), "utf8");
  const sheet = readFileSync(path.join(srcRoot, "components/edit-nights-sheet.tsx"), "utf8");
  const who = readFileSync(path.join(srcRoot, "components/whos-eating-sheet.tsx"), "utf8");
  const empty = readFileSync(path.join(srcRoot, "components/empty-day-card.tsx"), "utf8");
  const lib = readFileSync(path.join(srcRoot, "lib/whos-eating.ts"), "utf8");
  const nights = readFileSync(path.join(srcRoot, "lib/edit-nights.ts"), "utf8");

  it("saves through v2 / setNightGuests and never wakes from attendee edits", () => {
    expect(gate).toContain("savePlanningPeopleV2");
    expect(gate).toContain("WhosEatingRow");
    expect(gate).toContain("compactOffNights={false}");
    expect(sheet).toContain("saveWeekPeopleV2");
    expect(sheet).toContain("sameNightCounts");
    expect(sheet).toContain("if (platesChanged) await onSave");
    expect(empty).toContain("setNightGuests");
    expect(empty).toContain("namedListForRequest");
    expect(empty).toMatch(/onClick=\{\(\) => setPeople\(dinnerRequestPeople\(people - 1\)\)\}/);
    expect(empty).toMatch(/onClick=\{\(\) => setPeople\(dinnerRequestPeople\(people \+ 1\)\)\}/);
    expect(empty).toMatch(/const requestDinner = \(\) => \{[\s\S]*onAdd\(draft\.trim\(\), dinnerRequestPeople\(people\)\)/);
    for (const source of [gate, sheet, who, empty, lib]) {
      expect(source).not.toContain("wakeWeekOrPlanChange");
      expect(source).not.toContain("requestBotWake");
      expect(source).not.toContain("check_now");
      expect(source.toLowerCase()).not.toContain("grandma");
      expect(source.toLowerCase()).not.toContain("iphone");
    }
    expect(nights).toContain("attendee-only edit: no wake");
    expect(who).toContain("AddNameInline");
    expect(who).toContain("WHOS_EATING_EATER_READONLY");
    expect(WHOS_EATING_EATER_READONLY).toBe("Only Admins and Users can change who's eating.");
    expect(who).toContain("AddNameInline");
    expect(who).toContain("AttendeeChips");
    expect(who).toContain("WhosEatingSheetShell");
    expect(who).toContain("TakeOffConfirmDialog");
    expect(who).toContain("@/components/ui/dialog");
    expect(who).toMatch(/onOpenChange=\{\(next\) => \(!next \? onKeep\(\) : undefined\)\}/);
    expect(who).toContain("keepCurrent");
    expect(who).not.toContain('role="alertdialog"');
    expect(who).not.toMatch(/data-slot="whos-eating-take-off"[\s\S]{0,120}rounded-\[14px\] border border-border/);
  });
});
