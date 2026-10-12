import { createId } from "./ids";
import { normalizeNightHeadcounts } from "./headcount";
import { canActOnBallot } from "./lock";
import type {
  AllergenCode,
  FoodRule,
  FoodRuleSeverity,
  HouseholdEater,
  HouseholdSnapshot,
  Membership,
  RecipeFoodHold,
  Role,
  WeekNightAttendee,
  WeekNightList,
} from "./types";
import { ALLERGEN_CODES, FOOD_RULE_SEVERITIES } from "./types";

export { ALLERGEN_CODES, FOOD_RULE_SEVERITIES };

/** UI agents A–D import copy, grouping, counts, and snapshot reducers from this file. */

export const HOUSEHOLD_EATERS_MAX = 12;
export const FOOD_LABEL_MAX = 60;
export const FOOD_DETAILS_MAX = 200;
export const EATER_NAME_MAX = 40;

export const FOOD_RULES_TITLE = "Food rules";
export const FOOD_RULES_NOT_SET_UP = "Not set up";
export const FOOD_RULES_NONE = "No allergies or foods to skip";
export const FOOD_RULES_SAFETY =
  "A keyword check of titles and ingredients. Not a guarantee. Always read labels.";
export const WHOLE_HOUSE_LABEL = "Whole house";
export const PEOPLE_AT_THE_TABLE = "People at the table";
export const ADD_NAME_LABEL = "+ Name";
export const ADD_NAME_HELPER = "For someone without their own sign-in, like a child.";
export const REMOVE_PERSON_RULES_GO = "Their food rules go too.";
export const FOOD_RULE_APPLIES_HOUSE = "Applies to every dinner.";
export const FOOD_RULE_CROSS_CONTACT =
  "For cross-contact risk in the kitchen, choose Whole house.";
export const FOOD_HOLD_ASK = "Ask for a new recipe";
export const FOOD_HOLD_ACK = "I\u2019ve checked";
export const FOOD_RULE_CHECK_LABEL = "Check label";
export const FOOD_RULE_CHECK_LINE = "Check labels for allergens.";
export const FOOD_RULE_CONFLICTS = "Conflicts with a food rule";
export const FOOD_RULE_NEEDS_CHANGE = "Needs a change before this night is approved";
export const LAST_ATTENDEE_ERROR =
  "this person is the only one listed for a night. Add someone else to that night first.";
export const LAST_ATTENDEE_PREFIX = "last_attendee:";
export const FOOD_RULES_EATER_READONLY = "Eaters can look, not change food rules.";
export const NIGHTS_EATER_READONLY = "Eaters can look, not change nights.";
export const EATER_CAP_ERROR = "A household can list up to 12 people without a sign-in.";

export const ALLERGEN_LABELS: Record<AllergenCode, string> = {
  milk: "Milk",
  eggs: "Eggs",
  fish: "Fish",
  shellfish: "Shellfish",
  tree_nuts: "Tree nuts",
  peanuts: "Peanuts",
  wheat: "Wheat",
  soy: "Soy",
  sesame: "Sesame",
};

export const FOOD_RULE_SEVERITY_LABELS: Record<FoodRuleSeverity, string> = {
  allergy: "Allergy",
  intolerance: "Intolerance",
  dislike: "Dislike",
};

export const FOOD_RULE_SEVERITY_ORDER: Record<FoodRuleSeverity, number> = {
  allergy: 0,
  intolerance: 1,
  dislike: 2,
};

export type FoodRuleDraft = {
  subjectMembershipId?: string | null;
  subjectEaterId?: string | null;
  foodLabel: string;
  allergenCode?: AllergenCode | null;
  severity: FoodRuleSeverity;
  details?: string;
};

export type NightPeopleInput = {
  dayIndex: number;
  everyone?: boolean;
  membershipIds?: readonly string[];
  eaterIds?: readonly string[];
  guests?: number;
};

export type FoodRuleGroup = {
  key: string;
  who: string;
  kind: "house" | "member" | "named";
  subjectMembershipId: string | null;
  subjectEaterId: string | null;
  rules: FoodRule[];
};

export type FoodRuleCounts = {
  allergies: number;
  intolerances: number;
  dislikes: number;
  total: number;
};

export function parseAllergenCode(value: unknown): AllergenCode | null {
  switch (value) {
    case "milk":
    case "eggs":
    case "fish":
    case "shellfish":
    case "tree_nuts":
    case "peanuts":
    case "wheat":
    case "soy":
    case "sesame":
      return value;
    default:
      return null;
  }
}

export function parseFoodRuleSeverity(value: unknown): FoodRuleSeverity | null {
  switch (value) {
    case "allergy":
    case "intolerance":
    case "dislike":
      return value;
    default:
      return null;
  }
}

export function allergenLabel(code: AllergenCode): string {
  return ALLERGEN_LABELS[code];
}

export function severityLabel(severity: FoodRuleSeverity): string {
  return FOOD_RULE_SEVERITY_LABELS[severity];
}

export function foodKeyFromLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeFoodLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export function normalizeEaterName(name: string): string {
  return name.trim();
}

export function emptyFoodRulesState(): Pick<
  HouseholdSnapshot,
  "eaters" | "foodRules" | "nightLists" | "nightAttendees" | "foodHolds"
> {
  return {
    eaters: [],
    foodRules: [],
    nightLists: [],
    nightAttendees: [],
    foodHolds: [],
  };
}

export function foodRuleWho(
  rule: Pick<FoodRule, "subjectMembershipId" | "subjectEaterId">,
  memberships: readonly Membership[],
  eaters: readonly HouseholdEater[],
): string {
  if (rule.subjectMembershipId) {
    return memberships.find((member) => member.id === rule.subjectMembershipId)?.displayName ?? WHOLE_HOUSE_LABEL;
  }
  if (rule.subjectEaterId) {
    return eaters.find((eater) => eater.id === rule.subjectEaterId)?.displayName ?? WHOLE_HOUSE_LABEL;
  }
  return WHOLE_HOUSE_LABEL;
}

export function foodRuleAppliesLine(who: string): string {
  return who === WHOLE_HOUSE_LABEL ? FOOD_RULE_APPLIES_HOUSE : `Applies on the nights ${who} is eating.`;
}

export function foodHoldBanner(food: string): string {
  return `May contain ${food}`;
}

export function foodRuleOnList(name: string): string {
  return `On ${name}\u2019s allergy list.`;
}

export function removePersonTitle(name: string): string {
  return `Remove ${name}?`;
}

export function removedPersonRulesToast(name: string): string {
  return `Removed ${name}\u2019s food rules`;
}

export function isLastAttendeeError(message: string): boolean {
  return message.includes(LAST_ATTENDEE_PREFIX) || message.includes(LAST_ATTENDEE_ERROR);
}

export function foodRuleCounts(rules: readonly FoodRule[]): FoodRuleCounts {
  let allergies = 0;
  let intolerances = 0;
  let dislikes = 0;
  for (const rule of rules) {
    switch (rule.severity) {
      case "allergy":
        allergies += 1;
        break;
      case "intolerance":
        intolerances += 1;
        break;
      case "dislike":
        dislikes += 1;
        break;
      default: {
        const _exhaustive: never = rule.severity;
        return _exhaustive;
      }
    }
  }
  return { allergies, intolerances, dislikes, total: allergies + intolerances + dislikes };
}

function countPart(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/** House row / settings counts. Never reviewed stays "Not set up". */
export function foodRulesCountsLine(
  rules: readonly FoodRule[],
  reviewedAt: string | null | undefined,
): string {
  if (!reviewedAt) return FOOD_RULES_NOT_SET_UP;
  const counts = foodRuleCounts(rules);
  if (counts.total === 0) return FOOD_RULES_NONE;
  return [
    countPart(counts.allergies, "allergy", "allergies"),
    countPart(counts.intolerances, "intolerance", "intolerances"),
    countPart(counts.dislikes, "food to skip", "foods to skip"),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" \u00b7 ");
}

export function foodRulesPlanningLine(rules: readonly FoodRule[]): string {
  const n = rules.length;
  return `Planning around ${n} food ${n === 1 ? "rule" : "rules"}`;
}

function sortRules(rules: readonly FoodRule[]): FoodRule[] {
  return [...rules].sort((a, b) => {
    const severity = FOOD_RULE_SEVERITY_ORDER[a.severity] - FOOD_RULE_SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    return a.foodLabel.localeCompare(b.foodLabel) || a.id.localeCompare(b.id);
  });
}

export function groupFoodRules(
  rules: readonly FoodRule[],
  memberships: readonly Membership[],
  eaters: readonly HouseholdEater[],
): FoodRuleGroup[] {
  const groups = new Map<string, FoodRuleGroup>();
  for (const rule of rules) {
    const who = foodRuleWho(rule, memberships, eaters);
    const kind: FoodRuleGroup["kind"] = rule.subjectMembershipId
      ? "member"
      : rule.subjectEaterId
        ? "named"
        : "house";
    const key = kind === "house" ? "house" : `${kind}:${rule.subjectMembershipId ?? rule.subjectEaterId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rules.push(rule);
      continue;
    }
    groups.set(key, {
      key,
      who,
      kind,
      subjectMembershipId: rule.subjectMembershipId,
      subjectEaterId: rule.subjectEaterId,
      rules: [rule],
    });
  }

  return [...groups.values()]
    .map((group) => ({ ...group, rules: sortRules(group.rules) }))
    .sort((a, b) => {
      const kindOrder = { house: 0, member: 1, named: 2 } as const;
      const kind = kindOrder[a.kind] - kindOrder[b.kind];
      if (kind !== 0) return kind;
      return a.who.localeCompare(b.who) || a.key.localeCompare(b.key);
    });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function parseHouseholdEaters(rows: unknown): HouseholdEater[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): HouseholdEater[] => {
    const record = asRecord(row);
    if (!record || record.id == null || record.household_id == null) return [];
    const displayName = typeof record.display_name === "string" ? record.display_name.trim() : "";
    if (!displayName) return [];
    return [
      {
        id: String(record.id),
        householdId: String(record.household_id),
        displayName,
        createdAt: typeof record.created_at === "string" ? record.created_at : "",
      },
    ];
  });
}

export function parseFoodRules(rows: unknown): FoodRule[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): FoodRule[] => {
    const record = asRecord(row);
    if (!record || record.id == null || record.household_id == null) return [];
    const severity = parseFoodRuleSeverity(record.severity);
    const foodLabel =
      typeof record.food_label === "string" ? normalizeFoodLabel(record.food_label) : "";
    if (!severity || !foodLabel) return [];
    const foodKey =
      typeof record.food_key === "string" && record.food_key.trim()
        ? record.food_key.trim()
        : foodKeyFromLabel(foodLabel);
    return [
      {
        id: String(record.id),
        householdId: String(record.household_id),
        subjectMembershipId:
          typeof record.subject_membership_id === "string" ? record.subject_membership_id : null,
        subjectEaterId: typeof record.subject_eater_id === "string" ? record.subject_eater_id : null,
        foodLabel,
        foodKey,
        allergenCode: parseAllergenCode(record.allergen_code),
        severity,
        details: typeof record.details === "string" ? record.details : "",
        createdAt: typeof record.created_at === "string" ? record.created_at : "",
        updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
      },
    ];
  });
}

export function parseWeekNightLists(rows: unknown): WeekNightList[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): WeekNightList[] => {
    const record = asRecord(row);
    if (!record || record.household_id == null || record.week_id == null) return [];
    const dayIndex = Number(record.day_index);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return [];
    const guests = Number(record.guests);
    return [
      {
        householdId: String(record.household_id),
        weekId: String(record.week_id),
        dayIndex,
        guests: Number.isFinite(guests) && guests > 0 ? Math.min(12, Math.round(guests)) : 0,
        updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
      },
    ];
  });
}

export function parseWeekNightAttendees(rows: unknown): WeekNightAttendee[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): WeekNightAttendee[] => {
    const record = asRecord(row);
    if (!record || record.id == null || record.household_id == null || record.week_id == null) {
      return [];
    }
    const dayIndex = Number(record.day_index);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return [];
    const membershipId = typeof record.membership_id === "string" ? record.membership_id : null;
    const eaterId = typeof record.eater_id === "string" ? record.eater_id : null;
    if ((membershipId == null) === (eaterId == null)) return [];
    return [
      {
        id: String(record.id),
        householdId: String(record.household_id),
        weekId: String(record.week_id),
        dayIndex,
        membershipId,
        eaterId,
      },
    ];
  });
}

export function parseRecipeFoodHolds(rows: unknown): RecipeFoodHold[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): RecipeFoodHold[] => {
    const record = asRecord(row);
    if (
      !record ||
      record.id == null ||
      record.household_id == null ||
      record.recipe_id == null ||
      record.rule_id == null
    ) {
      return [];
    }
    return [
      {
        id: String(record.id),
        householdId: String(record.household_id),
        recipeId: String(record.recipe_id),
        ruleId: String(record.rule_id),
        matchedTerm: typeof record.matched_term === "string" ? record.matched_term : "",
        createdAt: typeof record.created_at === "string" ? record.created_at : "",
        acknowledgedBy: typeof record.acknowledged_by === "string" ? record.acknowledged_by : null,
        acknowledgedAt: typeof record.acknowledged_at === "string" ? record.acknowledged_at : null,
      },
    ];
  });
}

export function nightPeopleToJson(nights: readonly NightPeopleInput[]): unknown[] {
  return nights.map((night) => {
    if (night.everyone) {
      return { day_index: night.dayIndex, everyone: true };
    }
    return {
      day_index: night.dayIndex,
      membership_ids: [...(night.membershipIds ?? [])],
      eater_ids: [...(night.eaterIds ?? [])],
      guests: night.guests ?? 0,
    };
  });
}

export function assertFoodRulesWriter(role: Role | null | undefined, message = FOOD_RULES_EATER_READONLY) {
  if (!canActOnBallot(role)) throw new Error(message);
}

export function validateEaterName(
  name: string,
  existing: readonly HouseholdEater[],
  ignoreId?: string,
  memberNames: readonly string[] = [],
): string | null {
  const displayName = normalizeEaterName(name);
  if (!displayName) return "Name is required.";
  if (displayName.length > EATER_NAME_MAX) return "Use a name of 40 characters or fewer.";
  const key = displayName.toLowerCase();
  if (
    existing.some((eater) => eater.id !== ignoreId && eater.displayName.toLowerCase() === key) ||
    memberNames.some((member) => member.toLowerCase() === key)
  ) {
    return "That name is already at the table.";
  }
  return null;
}

export function validateFoodRuleDraft(draft: FoodRuleDraft): string | null {
  const label = normalizeFoodLabel(draft.foodLabel);
  if (!label) return "Name the food.";
  if (label.length > FOOD_LABEL_MAX) return "Use a food name of 60 characters or fewer.";
  if ((draft.details ?? "").length > FOOD_DETAILS_MAX) {
    return "Keep details to 200 characters.";
  }
  if (draft.subjectMembershipId && draft.subjectEaterId) {
    return "Pick one person, or Whole house.";
  }
  if (!parseFoodRuleSeverity(draft.severity)) return "Pick allergy, intolerance, or dislike.";
  if (draft.allergenCode != null && !parseAllergenCode(draft.allergenCode)) {
    return "That allergen is not on the list.";
  }
  return null;
}

function personIsLastAttendee(
  snapshot: HouseholdSnapshot,
  input: { membershipId?: string | null; eaterId?: string | null },
): boolean {
  const nights = new Map<string, number>();
  for (const row of snapshot.nightAttendees) {
    const key = `${row.weekId}:${row.dayIndex}`;
    nights.set(key, (nights.get(key) ?? 0) + 1);
  }
  return snapshot.nightAttendees.some((row) => {
    const match = input.membershipId
      ? row.membershipId === input.membershipId
      : input.eaterId
        ? row.eaterId === input.eaterId
        : false;
    return match && (nights.get(`${row.weekId}:${row.dayIndex}`) ?? 0) === 1;
  });
}

export function applyAddEater(snapshot: HouseholdSnapshot, eater: HouseholdEater): HouseholdSnapshot {
  if (snapshot.eaters.length >= HOUSEHOLD_EATERS_MAX) throw new Error(EATER_CAP_ERROR);
  const error = validateEaterName(eater.displayName, snapshot.eaters);
  if (error) throw new Error(error);
  return { ...snapshot, eaters: [...snapshot.eaters, eater] };
}

export function applyRenameEater(
  snapshot: HouseholdSnapshot,
  eaterId: string,
  displayName: string,
): HouseholdSnapshot {
  const error = validateEaterName(displayName, snapshot.eaters, eaterId);
  if (error) throw new Error(error);
  const name = normalizeEaterName(displayName);
  return {
    ...snapshot,
    eaters: snapshot.eaters.map((eater) => (eater.id === eaterId ? { ...eater, displayName: name } : eater)),
  };
}

export function applyRemoveEater(snapshot: HouseholdSnapshot, eaterId: string): HouseholdSnapshot {
  if (personIsLastAttendee(snapshot, { eaterId })) {
    throw new Error(`${LAST_ATTENDEE_PREFIX} ${LAST_ATTENDEE_ERROR}`);
  }
  return {
    ...snapshot,
    eaters: snapshot.eaters.filter((eater) => eater.id !== eaterId),
    foodRules: snapshot.foodRules.filter((rule) => rule.subjectEaterId !== eaterId),
    nightAttendees: snapshot.nightAttendees.filter((row) => row.eaterId !== eaterId),
  };
}

export function applyAddFoodRule(snapshot: HouseholdSnapshot, rule: FoodRule): HouseholdSnapshot {
  const error = validateFoodRuleDraft({
    subjectMembershipId: rule.subjectMembershipId,
    subjectEaterId: rule.subjectEaterId,
    foodLabel: rule.foodLabel,
    allergenCode: rule.allergenCode,
    severity: rule.severity,
    details: rule.details,
  });
  if (error) throw new Error(error);
  return { ...snapshot, foodRules: [rule, ...snapshot.foodRules.filter((row) => row.id !== rule.id)] };
}

export function applyUpdateFoodRule(
  snapshot: HouseholdSnapshot,
  ruleId: string,
  patch: Partial<Pick<FoodRule, "foodLabel" | "foodKey" | "allergenCode" | "severity" | "details" | "subjectMembershipId" | "subjectEaterId" | "updatedAt">>,
): HouseholdSnapshot {
  return {
    ...snapshot,
    foodRules: snapshot.foodRules.map((rule) => {
      if (rule.id !== ruleId) return rule;
      const next = { ...rule, ...patch };
      if (patch.foodLabel != null) {
        next.foodLabel = normalizeFoodLabel(patch.foodLabel);
        next.foodKey = patch.foodKey ?? foodKeyFromLabel(next.foodLabel);
      }
      return next;
    }),
  };
}

export function applyRemoveFoodRule(snapshot: HouseholdSnapshot, ruleId: string): HouseholdSnapshot {
  return {
    ...snapshot,
    foodRules: snapshot.foodRules.filter((rule) => rule.id !== ruleId),
    foodHolds: snapshot.foodHolds.filter((hold) => hold.ruleId !== ruleId),
  };
}

export function applyMarkFoodRulesReviewed(
  snapshot: HouseholdSnapshot,
  reviewedAt: string,
): HouseholdSnapshot {
  return {
    ...snapshot,
    household: { ...snapshot.household, foodRulesReviewedAt: reviewedAt },
  };
}

export function applyAckFoodHold(
  snapshot: HouseholdSnapshot,
  holdId: string,
  input: { acknowledgedBy: string; acknowledgedAt: string },
): HouseholdSnapshot {
  return {
    ...snapshot,
    foodHolds: snapshot.foodHolds.map((hold) =>
      hold.id === holdId
        ? { ...hold, acknowledgedBy: input.acknowledgedBy, acknowledgedAt: input.acknowledgedAt }
        : hold,
    ),
  };
}

function replaceNightPeople(
  snapshot: HouseholdSnapshot,
  weekId: string,
  householdId: string,
  nights: readonly NightPeopleInput[],
  now: string,
): Pick<HouseholdSnapshot, "nightLists" | "nightAttendees"> {
  const drop = new Set(nights.map((night) => `${weekId}:${night.dayIndex}`));
  let nightLists = snapshot.nightLists.filter((row) => !drop.has(`${row.weekId}:${row.dayIndex}`));
  let nightAttendees = snapshot.nightAttendees.filter(
    (row) => !drop.has(`${row.weekId}:${row.dayIndex}`),
  );

  for (const night of nights) {
    const listedMembers = night.membershipIds ?? [];
    const listedEaters = night.eaterIds ?? [];
    const everyone = night.everyone || listedMembers.length + listedEaters.length === 0;
    if (everyone) continue;
    nightLists = [
      ...nightLists,
      {
        householdId,
        weekId,
        dayIndex: night.dayIndex,
        guests: Math.max(0, night.guests ?? 0),
        updatedAt: now,
      },
    ];
    nightAttendees = [
      ...nightAttendees,
      ...listedMembers.map((membershipId) => ({
        id: createId("att"),
        householdId,
        weekId,
        dayIndex: night.dayIndex,
        membershipId,
        eaterId: null,
      })),
      ...listedEaters.map((eaterId) => ({
        id: createId("att"),
        householdId,
        weekId,
        dayIndex: night.dayIndex,
        membershipId: null,
        eaterId,
      })),
    ];
  }

  return { nightLists, nightAttendees };
}

function platesForWeek(
  snapshot: HouseholdSnapshot,
  weekId: string,
  counts: number[],
  nightLists: readonly WeekNightList[],
  nightAttendees: readonly WeekNightAttendee[],
): number[] {
  const plates = normalizeNightHeadcounts(counts);
  return plates.map((count, dayIndex) => {
    if (count === 0) return 0;
    const list = nightLists.find((row) => row.weekId === weekId && row.dayIndex === dayIndex);
    if (!list) return count;
    const listed = nightAttendees.filter(
      (row) => row.weekId === weekId && row.dayIndex === dayIndex,
    ).length;
    return listed + list.guests;
  });
}

function withWeekPlates(
  snapshot: HouseholdSnapshot,
  weekId: string,
  counts: number[],
  instructions: string | null,
  nightLists: WeekNightList[],
  nightAttendees: WeekNightAttendee[],
): HouseholdSnapshot {
  const cooking = snapshot.week.id === weekId;
  const planning = snapshot.planning?.week.id === weekId;
  const nextLists = nightLists.filter((row) => counts[row.dayIndex] !== 0 || row.weekId !== weekId);
  const nextAttendees = nightAttendees.filter(
    (row) => counts[row.dayIndex] !== 0 || row.weekId !== weekId,
  );
  const plates = platesForWeek(snapshot, weekId, counts, nextLists, nextAttendees);

  if (cooking) {
    return {
      ...snapshot,
      week: {
        ...snapshot.week,
        nightHeadcounts: plates,
        specialInstructions: instructions,
      },
      nightLists: nextLists,
      nightAttendees: nextAttendees,
    };
  }
  if (planning && snapshot.planning) {
    return {
      ...snapshot,
      planning: {
        ...snapshot.planning,
        week: {
          ...snapshot.planning.week,
          nightHeadcounts: plates,
          specialInstructions: instructions,
          peopleConfirmedAt: snapshot.planning.week.peopleConfirmedAt ?? new Date().toISOString(),
        },
      },
      nightLists: nextLists,
      nightAttendees: nextAttendees,
    };
  }
  return { ...snapshot, nightLists: nextLists, nightAttendees: nextAttendees };
}

export function applySaveWeekPeopleV2(
  snapshot: HouseholdSnapshot,
  weekId: string,
  counts: number[],
  instructions: string | null,
  attendees: readonly NightPeopleInput[] | null,
): HouseholdSnapshot {
  const householdId = snapshot.household.id;
  const now = new Date().toISOString();
  const next =
    attendees == null
      ? { nightLists: snapshot.nightLists, nightAttendees: snapshot.nightAttendees }
      : replaceNightPeople(snapshot, weekId, householdId, attendees, now);
  return withWeekPlates(snapshot, weekId, counts, instructions, next.nightLists, next.nightAttendees);
}

export function applySetNightGuests(
  snapshot: HouseholdSnapshot,
  weekId: string,
  dayIndex: number,
  guests: number,
): HouseholdSnapshot {
  if (guests < 0) throw new Error("Guests cannot be below zero.");
  const list = snapshot.nightLists.find((row) => row.weekId === weekId && row.dayIndex === dayIndex);
  if (!list) throw new Error("That night has no named list.");
  const listed = snapshot.nightAttendees.filter(
    (row) => row.weekId === weekId && row.dayIndex === dayIndex,
  ).length;
  const plates = listed + guests;
  const nightLists = snapshot.nightLists.map((row) =>
    row.weekId === weekId && row.dayIndex === dayIndex
      ? { ...row, guests, updatedAt: new Date().toISOString() }
      : row,
  );

  const patchWeekCounts = (counts: number[] | null): number[] | null => {
    if (!counts) return counts;
    const next = [...counts];
    next[dayIndex] = plates;
    return next;
  };

  if (snapshot.week.id === weekId) {
    return {
      ...snapshot,
      week: { ...snapshot.week, nightHeadcounts: patchWeekCounts(snapshot.week.nightHeadcounts) },
      nightLists,
    };
  }
  if (snapshot.planning?.week.id === weekId) {
    return {
      ...snapshot,
      planning: {
        ...snapshot.planning,
        week: {
          ...snapshot.planning.week,
          nightHeadcounts: patchWeekCounts(snapshot.planning.week.nightHeadcounts),
        },
      },
      nightLists,
    };
  }
  return { ...snapshot, nightLists };
}

export function optimisticEater(
  householdId: string,
  displayName: string,
  createdAt = new Date().toISOString(),
): HouseholdEater {
  return {
    id: createId("eater"),
    householdId,
    displayName: normalizeEaterName(displayName),
    createdAt,
  };
}

export function optimisticFoodRule(
  householdId: string,
  draft: FoodRuleDraft,
  now = new Date().toISOString(),
): FoodRule {
  const foodLabel = normalizeFoodLabel(draft.foodLabel);
  return {
    id: createId("rule"),
    householdId,
    subjectMembershipId: draft.subjectMembershipId ?? null,
    subjectEaterId: draft.subjectEaterId ?? null,
    foodLabel,
    foodKey: foodKeyFromLabel(foodLabel),
    allergenCode: draft.allergenCode ?? null,
    severity: draft.severity,
    details: (draft.details ?? "").trim(),
    createdAt: now,
    updatedAt: now,
  };
}

/** Local/demo snapshot seed: same empty collections the Supabase mapper uses. */
export function withEmptyFoodRules<T extends HouseholdSnapshot>(snapshot: T): T {
  return {
    ...snapshot,
    household: {
      ...snapshot.household,
      foodRulesReviewedAt: snapshot.household.foodRulesReviewedAt ?? null,
    },
    ...emptyFoodRulesState(),
  };
}
