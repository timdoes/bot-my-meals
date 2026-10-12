import { nightsPlannedFromHeadcounts } from "./house-setup";
import { normalizeNightHeadcounts } from "./headcount";
import type { BallotRequest, HouseholdSnapshot, WeekRole } from "./types";

export const PLANNING_PEOPLE_TITLE = "People per night";
export const PLANNING_PEOPLE_HELPER =
  "How many plates that night. Zero is an off night — no dinner planned.";
export const PLANNING_PEOPLE_SAVE_LABEL = "Save";
export const PLANNING_PEOPLE_BACK_LABEL = "Back";
export const PLANNING_PEOPLE_NEED_NIGHT = "Set at least one dinner night (plates above zero).";
export const PLANNING_SWIPE_TOAST = "Next week started. Set people per night.";
export const PLANNING_CREATE_ERROR = "Couldn\u2019t start next week. Try again.";

export const SPECIAL_INSTRUCTIONS_LABEL = "Special instructions";
export const SPECIAL_INSTRUCTIONS_HELPER =
  "Optional. Tell your bot anything for this week\u2019s meals (guests, no leftovers, keep it simple\u2026).";
export const SPECIAL_INSTRUCTIONS_PLACEHOLDER = "e.g. Guests Thursday — easy weeknights";

/** Hard cap. Typing is not cut off at a shorter soft limit mid-sentence. */
export const SPECIAL_INSTRUCTIONS_MAX = 500;

/** Who's-eating coverage sits above this field when the house has named people. */

/**
 * Empty planning: the next-week row exists and its plates are not saved yet.
 * Meals already on the week mean this gate was not part of that week.
 */
export function planningPeopleGateOpen(input: {
  role: WeekRole;
  peopleConfirmedAt: string | null;
  mealCount: number;
}): boolean {
  switch (input.role) {
    case "planning":
      return input.peopleConfirmedAt == null && input.mealCount === 0;
    case "cooking":
      return false;
    default: {
      const _exhaustive: never = input.role;
      return _exhaustive;
    }
  }
}

export function hasDinnerNight(counts: readonly number[]): boolean {
  return normalizeNightHeadcounts([...counts]).some((count) => count > 0);
}

export function clampSpecialInstructions(value: string): string | null {
  const trimmed = value.trim().slice(0, SPECIAL_INSTRUCTIONS_MAX);
  return trimmed.length > 0 ? trimmed : null;
}

/** This week's plates and note. House defaults on the snapshot stay as they were. */
export function patchPlanningPeople(
  snapshot: HouseholdSnapshot,
  input: { nightHeadcounts: number[]; specialInstructions: string },
): HouseholdSnapshot {
  if (!snapshot.planning) return snapshot;
  const counts = normalizeNightHeadcounts(input.nightHeadcounts);
  const instructions = clampSpecialInstructions(input.specialInstructions);
  const now = new Date().toISOString();
  const week = snapshot.planning.week;
  const previous = snapshot.planning.ballotRequest;
  const ballot: BallotRequest = {
    id: previous?.id ?? "optimistic-planning-ballot",
    householdId: week.householdId,
    weekId: week.id,
    status: previous?.status === "fulfilled" || previous?.status === "cancelled" ? previous.status : "pending",
    householdSize: snapshot.household.householdSize,
    nightsPlanned: nightsPlannedFromHeadcounts(counts),
    nightHeadcounts: counts,
    storeNames: previous?.storeNames ?? snapshot.stores.map((store) => store.name),
    weeklyBudgetCents: snapshot.household.weeklyBudgetCents,
    postalCode: snapshot.household.postalCode,
    requestedBy: previous?.requestedBy ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    fulfilledAt: previous?.fulfilledAt ?? null,
    specialInstructions: instructions,
  };
  return {
    ...snapshot,
    planning: {
      ...snapshot.planning,
      week: {
        ...week,
        peopleConfirmedAt: week.peopleConfirmedAt ?? now,
        nightHeadcounts: counts,
        specialInstructions: instructions,
      },
      ballotRequest: ballot,
    },
  };
}
