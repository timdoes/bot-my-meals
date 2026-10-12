import { WEEKDAY_LABELS } from "./dates";
import {
  ADD_NAME_LABEL,
  EATER_NAME_MAX,
  HOUSEHOLD_EATERS_MAX,
  WHOLE_HOUSE_LABEL,
  foodRuleWho,
  normalizeEaterName,
  type NightPeopleInput,
} from "./food-rules";
import { ruleHit } from "./food-rule-match";
import { MAX_HEADCOUNT, clampNightHeadcount, normalizeNightHeadcounts } from "./headcount";
import { canActOnBallot } from "./lock";
import type {
  FoodRule,
  HouseholdEater,
  HouseholdSnapshot,
  Meal,
  Membership,
  Role,
  WeekNightAttendee,
  WeekNightList,
} from "./types";

export { ADD_NAME_LABEL };

export const WHOS_EATING_LABEL = "Who's eating";
export const WHOS_EATING_EVERYONE = "Everyone";
export const WHOS_EATING_HELPER = "Choose who's at dinner. Everyone is the default.";
export const WHOS_EATING_GUESTS_LABEL = "Guests";
export const WHOS_EATING_GUESTS_HELPER =
  "Not named above. Guest allergies go in Special instructions.";
export const WHOS_EATING_ADD_NAME_HELPER =
  "For someone without their own sign-in, like a child. Adds them to People at the table and to this night.";
export const WHOS_EATING_ADD_NAME_PLACEHOLDER = "Name";
export const WHOS_EATING_STEPPER_FLOOR = "Take someone off Who's eating to go lower.";
export const WHOS_EATING_NEED_PERSON =
  "Pick at least one person. To skip dinner, set this night to Off.";
export const WHOS_EATING_EATER_READONLY = "Only Admins and Users can change who's eating.";
export const WHOS_EATING_KEEP = "Keep";
export const WHOS_EATING_TAKE_OFF = "Take off";
export const WHOS_EATING_DONE = "Done";
export const WHOS_EATING_CANCEL = "Cancel";
export const WHOS_EATING_ADD = "Add";
export const WHOS_EATING_CROSS_CONTACT =
  "Whole house rules still apply. For kitchen-wide cross-contact, set the rule to Whole house in Food rules.";
export const WHOS_EATING_CAP = "You've reached 12 named people.";
export const FOOD_RULES_COVERAGE_NONE = "No food rules set up";
export const FOOD_RULES_COVERAGE_ADD = "Add";
export const FOOD_RULES_COVERAGE_VIEW = "View";

export type TablePerson = {
  key: string;
  kind: "member" | "eater";
  id: string;
  name: string;
};

export type NightPeopleDraft = {
  everyone: boolean;
  membershipIds: string[];
  eaterIds: string[];
  guests: number;
};

export type AllergyConfirm = {
  key: string;
  name: string;
  weekday: string;
  allergyFoods: string[];
  mealHitFood: string | null;
};

export function tablePeople(
  memberships: readonly Membership[],
  eaters: readonly HouseholdEater[],
): TablePerson[] {
  return [
    ...memberships.map((member) => ({
      key: `member:${member.id}`,
      kind: "member" as const,
      id: member.id,
      name: member.displayName,
    })),
    ...eaters.map((eater) => ({
      key: `eater:${eater.id}`,
      kind: "eater" as const,
      id: eater.id,
      name: eater.displayName,
    })),
  ];
}

export function housePeopleCount(
  memberships: readonly Membership[],
  eaters: readonly HouseholdEater[],
): number {
  return memberships.length + eaters.length;
}

/**
 * LIVE-SAFETY: hide the feature when the new tables are not on this database,
 * when the house has no named people, or when only one person is at the table.
 */
export function showWhosEatingFeature(input: {
  schemaReady: boolean;
  eaters: readonly unknown[];
  memberships: readonly unknown[];
}): boolean {
  if (!input.schemaReady) return false;
  if (input.eaters.length === 0) return false;
  return input.memberships.length + input.eaters.length >= 2;
}

export function showWhosEatingRow(featureOn: boolean, plates: number, frozen = false): boolean {
  return featureOn && plates >= 1 && !frozen;
}

export function firstTimeGuests(plates: number, peopleInHouse: number): number {
  return Math.max(0, clampNightHeadcount(plates) - Math.max(0, peopleInHouse));
}

export function namedListPlates(people: number, guests: number): number {
  return Math.min(MAX_HEADCOUNT, Math.max(0, people) + Math.max(0, guests));
}

export function selectedPeopleCount(draft: NightPeopleDraft, houseCount: number): number {
  if (draft.everyone) return houseCount;
  return draft.membershipIds.length + draft.eaterIds.length;
}

export function draftIsEveryone(draft: Pick<NightPeopleDraft, "everyone" | "membershipIds" | "eaterIds">, houseCount: number): boolean {
  if (draft.everyone) return true;
  return draft.membershipIds.length + draft.eaterIds.length >= houseCount && houseCount > 0;
}

export function everyoneDraft(people: readonly TablePerson[], guests = 0): NightPeopleDraft {
  return {
    everyone: true,
    membershipIds: people.filter((person) => person.kind === "member").map((person) => person.id),
    eaterIds: people.filter((person) => person.kind === "eater").map((person) => person.id),
    guests,
  };
}

export function namedDraft(
  membershipIds: readonly string[],
  eaterIds: readonly string[],
  guests: number,
): NightPeopleDraft {
  return {
    everyone: false,
    membershipIds: [...membershipIds],
    eaterIds: [...eaterIds],
    guests: Math.max(0, guests),
  };
}

export function nightDraftFromRows(input: {
  people: readonly TablePerson[];
  list: WeekNightList | undefined;
  attendees: readonly WeekNightAttendee[];
  plates: number;
}): NightPeopleDraft {
  if (!input.list) return everyoneDraft(input.people);
  return namedDraft(
    input.attendees.flatMap((row) => (row.membershipId ? [row.membershipId] : [])),
    input.attendees.flatMap((row) => (row.eaterId ? [row.eaterId] : [])),
    input.list.guests,
  );
}

export function collapseIfEveryone(draft: NightPeopleDraft, houseCount: number): NightPeopleDraft {
  return draftIsEveryone(draft, houseCount) ? { ...draft, everyone: true } : { ...draft, everyone: false };
}

export function applyChipToggle(
  draft: NightPeopleDraft,
  person: TablePerson,
  houseCount: number,
  plates = 0,
): NightPeopleDraft {
  const selected = new Set(
    person.kind === "member" ? draft.membershipIds : draft.eaterIds,
  );
  if (selected.has(person.id)) selected.delete(person.id);
  else selected.add(person.id);
  const next =
    person.kind === "member"
      ? { ...draft, everyone: false, membershipIds: [...selected] }
      : { ...draft, everyone: false, eaterIds: [...selected] };
  const collapsed = collapseIfEveryone(next, houseCount);
  if (draftIsEveryone(draft, houseCount) && !collapsed.everyone) {
    return { ...collapsed, guests: firstTimeGuests(plates, houseCount) };
  }
  return collapsed;
}

export function applyEveryoneChip(people: readonly TablePerson[], guests: number): NightPeopleDraft {
  return everyoneDraft(people, guests);
}

export function platesForDraft(draft: NightPeopleDraft, houseCount: number, currentPlates: number): number {
  if (draftIsEveryone(draft, houseCount)) return clampNightHeadcount(currentPlates);
  return namedListPlates(selectedPeopleCount(draft, houseCount), draft.guests);
}

export function withNamedListGuests(draft: NightPeopleDraft, guests: number, houseCount: number): NightPeopleDraft {
  const next = { ...draft, guests: Math.max(0, guests) };
  return collapseIfEveryone(next, houseCount);
}

/** Named-list stepper edits guests. 0 plates drops the list (Off). */
export function applyNamedListStepper(
  draft: NightPeopleDraft,
  houseCount: number,
  nextPlates: number,
): { draft: NightPeopleDraft; plates: number } {
  const people = selectedPeopleCount(draft, houseCount);
  const plates = clampNightHeadcount(nextPlates);
  if (plates <= 0) {
    return { draft: everyoneDraft([], 0), plates: 0 };
  }
  return { draft: { ...draft, everyone: false, guests: Math.max(0, plates - people) }, plates };
}

export function selectedNames(draft: NightPeopleDraft, people: readonly TablePerson[]): string[] {
  if (draft.everyone) return people.map((person) => person.name);
  const members = new Set(draft.membershipIds);
  const eaters = new Set(draft.eaterIds);
  return people
    .filter((person) => (person.kind === "member" ? members.has(person.id) : eaters.has(person.id)))
    .map((person) => person.name);
}

/** Row value only: Everyone · Tim, Rose · Tim, Rose, Alex · Tim, Rose +2 */
export function whosEatingNamesLine(names: string[], everyone: boolean): string {
  if (everyone || names.length === 0) return WHOS_EATING_EVERYONE;
  if (names.length <= 3) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export function whosEatingRowLabel(names: string[], everyone: boolean): string {
  return `${WHOS_EATING_LABEL}: ${whosEatingNamesLine(names, everyone)}`;
}

export function whosEatingRowAria(weekday: string, names: string[], everyone: boolean): string {
  return `${WHOS_EATING_LABEL} ${weekday}: ${whosEatingNamesLine(names, everyone)}. Opens a list.`;
}

export function whosEatingSheetTitle(weekday: string): string {
  return `${WHOS_EATING_LABEL} ${weekday}?`;
}

export function planningAroundRules(count: number): string {
  return `Planning around ${count} ${count === 1 ? "rule" : "rules"}`;
}

export function foodRulesCoverageLine(count: number): string {
  return `Planning around ${count} food ${count === 1 ? "rule" : "rules"}`;
}

export function joinFoods(foods: readonly string[]): string {
  if (foods.length === 0) return "";
  if (foods.length === 1) return foods[0] ?? "";
  if (foods.length === 2) return `${foods[0]} and ${foods[1]}`;
  return `${foods.slice(0, -1).join(", ")}, and ${foods[foods.length - 1]}`;
}

export function footerPeoplePlatesLine(input: {
  everyone: boolean;
  people: number;
  guests: number;
  plates: number;
}): string {
  const plates = input.plates === 1 ? "1 plate" : `${input.plates} plates`;
  if (input.everyone) {
    if (input.plates >= input.people && input.people > 0) {
      const people = input.people === 1 ? "1 person" : `${input.people} people`;
      return `${people} · ${plates}`;
    }
    return `${WHOS_EATING_EVERYONE} · ${plates}`;
  }
  const people = input.people === 1 ? "1 person" : `${input.people} people`;
  if (input.guests <= 0) return `${people} · ${plates}`;
  const guests = input.guests === 1 ? "1 guest" : `${input.guests} guests`;
  return `${people} + ${guests} · ${plates}`;
}

export function personIsSelected(draft: NightPeopleDraft, person: TablePerson): boolean {
  if (draft.everyone) return true;
  return person.kind === "member"
    ? draft.membershipIds.includes(person.id)
    : draft.eaterIds.includes(person.id);
}

export function rulesForPerson(
  rules: readonly FoodRule[],
  person: Pick<TablePerson, "kind" | "id">,
): FoodRule[] {
  return rules.filter((rule) =>
    person.kind === "member"
      ? rule.subjectMembershipId === person.id
      : rule.subjectEaterId === person.id,
  );
}

export function wholeHouseRules(rules: readonly FoodRule[]): FoodRule[] {
  return rules.filter((rule) => !rule.subjectMembershipId && !rule.subjectEaterId);
}

export function rulesInScopeForDraft(
  rules: readonly FoodRule[],
  draft: NightPeopleDraft,
  houseCount: number,
): FoodRule[] {
  const everyone = draftIsEveryone(draft, houseCount);
  if (everyone) return [...rules];
  const members = new Set(draft.membershipIds);
  const eaters = new Set(draft.eaterIds);
  return rules.filter((rule) => {
    if (!rule.subjectMembershipId && !rule.subjectEaterId) return true;
    if (rule.subjectMembershipId) return members.has(rule.subjectMembershipId);
    if (rule.subjectEaterId) return eaters.has(rule.subjectEaterId);
    return false;
  });
}

export function footerRulesLine(
  rules: readonly FoodRule[],
  memberships: readonly Membership[],
  eaters: readonly HouseholdEater[],
): string {
  const groups = new Map<string, string[]>();
  for (const rule of rules) {
    const who = foodRuleWho(rule, memberships, eaters);
    const foods = groups.get(who) ?? [];
    foods.push(rule.foodLabel);
    groups.set(who, foods);
  }
  return [...groups.entries()]
    .map(([who, foods]) => `${who}: ${foods.join(", ").toLowerCase()}.`)
    .join(" ");
}

export function notApplyingLine(
  weekday: string,
  name: string,
  foods: readonly string[],
): string {
  return `Not applying ${weekday}: ${joinFoods(foods)} (${name} isn't eating).`;
}

export function takeOffTitle(name: string, weekday: string): string {
  return `Take ${name} off ${weekday}?`;
}

export function takeOffBody(name: string, weekday: string, foods: readonly string[]): string {
  const kind = foods.length === 1 ? "allergy" : "allergies";
  return `${name} has food rules: ${joinFoods(foods)} (${kind}). If ${name} isn't eating ${weekday}, those rules stop applying to that night's dinner.`;
}

export function takeOffMealHitBody(
  name: string,
  weekday: string,
  food: string,
  matched: string,
): string {
  return `${name} has a ${food.toLowerCase()} allergy and this dinner has ${matched.toLowerCase()}. ${takeOffTitle(name, weekday)}`;
}

export function alreadyAtTableError(name: string): string {
  return `${name} is already at the table.`;
}

export function validateInlineName(
  name: string,
  eaters: readonly HouseholdEater[],
  memberships: readonly Membership[] = [],
): string | null {
  const displayName = normalizeEaterName(name);
  if (!displayName) return "Name is required.";
  if (displayName.length > EATER_NAME_MAX) return "Use a name of 40 characters or fewer.";
  if (eaters.length >= HOUSEHOLD_EATERS_MAX) return WHOS_EATING_CAP;
  const key = displayName.toLowerCase();
  if (
    eaters.some((eater) => eater.displayName.toLowerCase() === key) ||
    memberships.some((member) => member.displayName.toLowerCase() === key)
  ) {
    return alreadyAtTableError(displayName);
  }
  return null;
}

export function peopleTakenOff(
  previous: NightPeopleDraft,
  next: NightPeopleDraft,
  people: readonly TablePerson[],
): TablePerson[] {
  return people.filter((person) => personIsSelected(previous, person) && !personIsSelected(next, person));
}

export function allergyConfirmsOnRemove(input: {
  previous: NightPeopleDraft;
  next: NightPeopleDraft;
  people: readonly TablePerson[];
  rules: readonly FoodRule[];
  weekday: string;
  mealText?: string | null;
}): AllergyConfirm[] {
  return peopleTakenOff(input.previous, input.next, input.people).flatMap((person) => {
    const allergies = rulesForPerson(input.rules, person).filter((rule) => rule.severity === "allergy");
    if (allergies.length === 0) return [];
    const mealText = input.mealText ?? "";
    const mealHit = allergies
      .map((rule) => ({ rule, hit: mealText ? ruleHit(rule, mealText) : null }))
      .find((row) => row.hit);
    return [
      {
        key: person.key,
        name: person.name,
        weekday: input.weekday,
        allergyFoods: allergies.map((rule) => rule.foodLabel),
        mealHitFood: mealHit?.hit ?? null,
      },
    ];
  });
}

export function canEditWhosEating(role: Role | null | undefined): boolean {
  return canActOnBallot(role);
}

export function weekCoverageRuleIds(input: {
  counts: readonly number[];
  drafts: readonly NightPeopleDraft[];
  rules: readonly FoodRule[];
  houseCount: number;
}): string[] {
  const seen = new Set<string>();
  input.counts.forEach((plates, dayIndex) => {
    if (plates <= 0) return;
    const draft = input.drafts[dayIndex] ?? everyoneDraft([]);
    for (const rule of rulesInScopeForDraft(input.rules, draft, input.houseCount)) {
      seen.add(rule.id);
    }
  });
  return [...seen];
}

export function nightPeopleInputs(
  drafts: readonly NightPeopleDraft[],
  counts: readonly number[],
  houseCount: number,
): NightPeopleInput[] {
  return drafts.map((draft, dayIndex) => {
    if ((counts[dayIndex] ?? 0) <= 0 || draftIsEveryone(draft, houseCount)) {
      return { dayIndex, everyone: true };
    }
    return {
      dayIndex,
      membershipIds: draft.membershipIds,
      eaterIds: draft.eaterIds,
      guests: draft.guests,
    };
  });
}

export function draftsFromSnapshot(input: {
  weekId: string;
  people: readonly TablePerson[];
  lists: readonly WeekNightList[];
  attendees: readonly WeekNightAttendee[];
  counts: readonly number[];
}): NightPeopleDraft[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayIndex) =>
    nightDraftFromRows({
      people: input.people,
      list: input.lists.find((row) => row.weekId === input.weekId && row.dayIndex === dayIndex),
      attendees: input.attendees.filter((row) => row.weekId === input.weekId && row.dayIndex === dayIndex),
      plates: input.counts[dayIndex] ?? 0,
    }),
  );
}

export function mealTextForNight(
  meals: readonly Pick<Meal, "dayIndex" | "title" | "pitch">[],
  dayIndex: number,
): string {
  return meals
    .filter((meal) => meal.dayIndex === dayIndex)
    .map((meal) => `${meal.title} ${meal.pitch}`)
    .join(" ")
    .trim();
}

export function namedListForRequest(input: {
  schemaReady: boolean;
  snapshot: Pick<HouseholdSnapshot, "nightLists" | "nightAttendees" | "eaters"> | null;
  weekId: string | null;
  dayName: string;
}): { weekId: string; dayIndex: number; peopleCount: number; guests: number } | null {
  if (!input.schemaReady || !input.snapshot || !input.weekId) return null;
  if (input.snapshot.eaters.length === 0) return null;
  const dayIndex = WEEKDAY_LABELS.findIndex((label) => label === input.dayName);
  if (dayIndex < 0) return null;
  const list = input.snapshot.nightLists.find(
    (row) => row.weekId === input.weekId && row.dayIndex === dayIndex,
  );
  if (!list) return null;
  const peopleCount = input.snapshot.nightAttendees.filter(
    (row) => row.weekId === input.weekId && row.dayIndex === dayIndex,
  ).length;
  if (peopleCount <= 0) return null;
  return { weekId: input.weekId, dayIndex, peopleCount, guests: list.guests };
}

export function sameNightCounts(left: readonly number[], right: readonly number[]): boolean {
  const a = normalizeNightHeadcounts([...left]);
  const b = normalizeNightHeadcounts([...right]);
  return a.every((count, index) => count === b[index]);
}

export function customizeNight(
  people: readonly TablePerson[],
  selected: readonly TablePerson[],
  plates: number,
): NightPeopleDraft {
  const guests = firstTimeGuests(plates, people.length);
  return collapseIfEveryone(
    namedDraft(
      selected.filter((person) => person.kind === "member").map((person) => person.id),
      selected.filter((person) => person.kind === "eater").map((person) => person.id),
      guests,
    ),
    people.length,
  );
}

export { WHOLE_HOUSE_LABEL };
