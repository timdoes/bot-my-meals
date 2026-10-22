import { WEEKDAY_SHORT } from "./dates";
import { classifyPostalCode, type PostalKind } from "./grocers";
import { clampHeadcount, clampNightHeadcount, normalizeNightHeadcounts } from "./headcount";
import { isHouseSetupEightStepLive } from "./supabase/missing-schema";
import { isAdmin } from "./users";
import type { BallotRequest, Meal, Role } from "./types";

export const CREATE_MEALS_CTA = "Create this week's meals";
export const WAITING_FOR_BOT = "Waiting for your Bot…";
export const DIY_GROK_PASTE_CTA = "Copy paste for your Grok Bot";
export const FINISH_SETUP_CTA = "Finish setup";

/** Today's 7-step scale. Used when the 8-step snapshot flag is off. */
export const HOUSE_SETUP_SEVEN_LAST_STEP = 7;
export const HOUSE_SETUP_SEVEN_DONE_STEP = 8;
/** Remapped 8-step scale. Used only when isHouseSetupEightStepLive() is true. */
export const HOUSE_SETUP_EIGHT_LAST_STEP = 8;
export const HOUSE_SETUP_EIGHT_DONE_STEP = 9;

export const HOUSE_SETUP_FIRST_STEP = 1;
/** 7-step done. repo.ts `?? HOUSE_SETUP_DONE_STEP` stays safe on an un-remapped DB. */
export const HOUSE_SETUP_DONE_STEP = HOUSE_SETUP_SEVEN_DONE_STEP;
export const HOUSE_SETUP_LAST_STEP = HOUSE_SETUP_SEVEN_LAST_STEP;

export const HOUSE_SETUP_SEVEN_STEP_IDS = [
  "invite",
  "size",
  "nights",
  "plates",
  "stores",
  "budget",
  "create-meals",
] as const;

export const HOUSE_SETUP_EIGHT_STEP_IDS = [
  "invite",
  "size",
  "nights",
  "plates",
  "food",
  "stores",
  "budget",
  "create-meals",
] as const;

export const HOUSE_SETUP_STEP_IDS = HOUSE_SETUP_EIGHT_STEP_IDS;
export type HouseSetupStepId = (typeof HOUSE_SETUP_EIGHT_STEP_IDS)[number];

const INVITE_STEP = {
  id: "invite" as const,
  title: "Invite people",
  helper: "Text this link. They open it in their browser, sign in, and join this house.",
  cta: "Continue",
};
const SIZE_STEP = {
  id: "size" as const,
  title: "How many people?",
  helper: "Plates for everyone at the table. You can change this later.",
  cta: "Next",
};
const NIGHTS_STEP = {
  id: "nights" as const,
  title: "Which nights get a meal?",
  helper: "You can turn nights off or change them later.",
  cta: "Continue",
};
const PLATES_STEP = {
  id: "plates" as const,
  title: "Plates per night",
  helper: "Defaults match your household. Change a night for guests.",
  cta: "Continue",
};
const FOOD_STEP = {
  id: "food" as const,
  title: "Allergies and foods to skip",
  helper: "Optional. Your Bot plans every dinner around these. Change them any time in House → Food rules.",
  cta: "Continue",
};
const STORES_STEP = {
  id: "stores" as const,
  title: "Stores",
  helper:
    "Enter a zip or postal code to see grocers for your region. Add any store. Labels only — we never invent grocery prices.",
  cta: "Continue",
};
const BUDGET_STEP = {
  id: "budget" as const,
  title: "Weekly meal budget",
  helper: "A target for dinners this week. We never invent grocery prices.",
  cta: "Continue",
};
const CREATE_MEALS_STEP = {
  id: "create-meals" as const,
  title: "Create meals",
  helper:
    "Create this week's meals. Your Bot gets this house's plates, nights, stores, and budget. There is no sample week.",
  cta: CREATE_MEALS_CTA,
};

export const HOUSE_SETUP_FOOD_SAFETY =
  "Allergies are avoided completely, including traces. We can't guarantee a meal is safe. Check labels and ingredients.";
export const HOUSE_SETUP_FOOD_WHO_LABEL = "Who is this for?";
export const HOUSE_SETUP_FOOD_EVERYONE = "Everyone";
export const HOUSE_SETUP_FOOD_ALLERGIES = "Food allergies";
export const HOUSE_SETUP_FOOD_ELSE_PLACEHOLDER = "Something else, e.g. celery";
export const HOUSE_SETUP_FOOD_DISLIKES = "Foods to never suggest";
export const HOUSE_SETUP_FOOD_DISLIKES_PLACEHOLDER = "e.g. Mushrooms, olives";
export const HOUSE_SETUP_FOOD_NONE = "No allergies or foods to skip";
export const HOUSE_SETUP_FOOD_SKIP = "Skip for now";
export const HOUSE_SETUP_FOOD_ADD = "Add";

function withStepNumbers<T extends { id: HouseSetupStepId }>(
  steps: readonly T[],
): ReadonlyArray<T & { step: number }> {
  return steps.map((step, index) => ({ ...step, step: index + 1 }));
}

export const HOUSE_SETUP_STEPS_SEVEN = withStepNumbers([
  INVITE_STEP,
  SIZE_STEP,
  NIGHTS_STEP,
  PLATES_STEP,
  STORES_STEP,
  BUDGET_STEP,
  CREATE_MEALS_STEP,
]);

export const HOUSE_SETUP_STEPS_EIGHT = withStepNumbers([
  INVITE_STEP,
  SIZE_STEP,
  NIGHTS_STEP,
  PLATES_STEP,
  FOOD_STEP,
  STORES_STEP,
  BUDGET_STEP,
  CREATE_MEALS_STEP,
]);

/** Active catalog. 7-step until the snapshot flag is on. */
export function houseSetupSteps(eightStep = isHouseSetupEightStepLive()) {
  return eightStep ? HOUSE_SETUP_STEPS_EIGHT : HOUSE_SETUP_STEPS_SEVEN;
}

/** @deprecated Prefer houseSetupSteps(). Alias of the 7-step list so existing tests keep a stable default. */
export const HOUSE_SETUP_STEPS = HOUSE_SETUP_STEPS_SEVEN;

export function houseSetupLastStep(eightStep = isHouseSetupEightStepLive()): 7 | 8 {
  return eightStep ? HOUSE_SETUP_EIGHT_LAST_STEP : HOUSE_SETUP_SEVEN_LAST_STEP;
}

export function houseSetupDoneStep(eightStep = isHouseSetupEightStepLive()): 8 | 9 {
  return eightStep ? HOUSE_SETUP_EIGHT_DONE_STEP : HOUSE_SETUP_SEVEN_DONE_STEP;
}

export const ALL_NIGHTS_ON = [true, true, true, true, true, true, true] as const;

export function nightsPlannedLabel(nights: number): string {
  return `${clampNightsPlanned(nights)} of 7`;
}

export function nightsOnFromHeadcounts(counts: number[]): boolean[] {
  const ons = normalizeNightHeadcounts(counts).map((count) => count > 0);
  return ons.some(Boolean) ? ons : [...ALL_NIGHTS_ON];
}

export function headcountsFromNightOns(householdSize: number, nightsOn: readonly boolean[]): number[] {
  const size = clampHeadcount(householdSize);
  const ons = nightsOn.length === 7 ? nightsOn : ALL_NIGHTS_ON;
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => (ons[weekday] ? size : 0));
}

export function applyNightOnsToHeadcounts(
  existing: number[] | null | undefined,
  householdSize: number,
  nightsOn: readonly boolean[],
): number[] {
  const size = clampHeadcount(householdSize);
  const ons = nightsOn.length === 7 ? nightsOn : ALL_NIGHTS_ON;
  const current = Array.isArray(existing) && existing.length === 7 ? existing.map(clampNightHeadcount) : null;
  return ons.map((on, index) => {
    if (!on) return 0;
    const prior = current?.[index] ?? 0;
    return prior > 0 ? prior : size;
  });
}

export function nightsPlannedFromOns(nightsOn: readonly boolean[]): number {
  return clampNightsPlanned(nightsOn.filter(Boolean).length);
}

export function clampNightsPlanned(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(7, Math.max(1, Math.round(n)));
}

export function headcountsFromPlan(householdSize: number, nightsPlanned: number): number[] {
  const size = clampHeadcount(householdSize);
  const nights = clampNightsPlanned(nightsPlanned);
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => (weekday < nights ? size : 0));
}

export function nightsPlannedFromHeadcounts(counts: number[]): number {
  const active = normalizeNightHeadcounts(counts).filter((count) => count > 0).length;
  return clampNightsPlanned(active || 7);
}

export function applyHouseholdSizeToHeadcounts(counts: number[], householdSize: number): number[] {
  const size = clampHeadcount(householdSize);
  return normalizeNightHeadcounts(counts).map((count) => (count > 0 ? size : 0));
}

export function houseSetupProgressLabel(
  step: number,
  eightStep = isHouseSetupEightStepLive(),
): string {
  const last = houseSetupLastStep(eightStep);
  const current = Math.min(last, clampHouseSetupStep(step, eightStep));
  return `Setup · step ${current} of ${last}`;
}

export function grokBotPastePrompt(input: {
  householdName: string;
  nightHeadcounts: number[];
  storeNames: string[];
  weeklyBudgetCents: number | null;
}): string {
  const plates = normalizeNightHeadcounts(input.nightHeadcounts)
    .map((count, weekday) => `${WEEKDAY_SHORT[weekday]} ${count}`)
    .join(", ");
  const stores = input.storeNames.length ? input.storeNames.join(", ") : "the house stores";
  const budget =
    input.weeklyBudgetCents == null
      ? "no weekly dollar target"
      : `weekly meal budget about $${formatWeeklyBudgetDollars(input.weeklyBudgetCents)} (a target, not grocery prices)`;
  return [
    `Propose a multi-approve ballot for our Bot My Meals house (${input.householdName || "our house"}).`,
    `Use these plates per night: ${plates}.`,
    `Shop at: ${stores}.`,
    `Budget: ${budget}.`,
    "Wake your Bot is required before Create this week's meals. Paste the Webhook URL in Settings → Wake your Bot. There is no Skip. Week and plan changes wake the bot. Write ballot, recipes, and the shopping list back to the site, and stay quiet if nothing changed.",
    "On each wake, read GET /api/bot/status. Do the work when needs_work is true on any open week, and stay silent when nothing changed.",
    "fill_pending means this locked week still needs recipes or a shopping list for covered dinners that have not passed. Write those, skip nights before planned_from, and skip a list when nothing needs buying.",
    "Keep a webhook routine named Wake on app event. On wake, sync this household (ballot, recipes, shopping list, setup) from the app, and stay quiet if nothing changed.",
    "For a next-week ballot, use that week's night_headcounts and special_instructions. Empty instructions are fine. Do not change House plate defaults.",
    "Never invent grocery prices. Never claim Smith's cart adds.",
  ].join(" ");
}

export type HouseSetupCompleteEvidence = {
  alreadyCreatedMeals?: boolean;
};

export function alreadyCreatedMealsFromSnapshot(
  snapshot:
    | {
        meals?: readonly Pick<Meal, "id">[] | null;
        ballotRequest?: Pick<BallotRequest, "id"> | null;
      }
    | null
    | undefined,
): boolean {
  if (!snapshot) return false;
  return Boolean(snapshot.ballotRequest || (snapshot.meals && snapshot.meals.length > 0));
}

/**
 * Clamp a stored setup_step.
 * Always allows 1–9 through so a remapped done house (9) is not collapsed
 * to 8 before the snapshot flag is known. Missing/invalid values use the
 * active done step (8 today, 9 after remap).
 */
export function clampHouseSetupStep(
  value: unknown,
  eightStep = isHouseSetupEightStepLive(),
): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return houseSetupDoneStep(eightStep);
  return Math.min(HOUSE_SETUP_EIGHT_DONE_STEP, Math.max(HOUSE_SETUP_FIRST_STEP, Math.round(n)));
}

export function isHouseSetupComplete(
  step: number,
  evidence?: HouseSetupCompleteEvidence,
  eightStep = isHouseSetupEightStepLive(),
): boolean {
  const n = clampHouseSetupStep(step, eightStep);
  if (n >= HOUSE_SETUP_EIGHT_DONE_STEP) return true;
  if (n < HOUSE_SETUP_SEVEN_DONE_STEP) return false;
  // Stored 8: done on the 7-step scale. After remap it is Create meals,
  // unless this house already created meals (pre-remap completed house).
  if (!eightStep) return true;
  return evidence?.alreadyCreatedMeals === true;
}

export function shouldShowHouseSetup(
  role: Role | null | undefined,
  setupStep: number,
  evidence?: HouseSetupCompleteEvidence,
): boolean {
  return isAdmin(role) && !isHouseSetupComplete(setupStep, evidence);
}

export type HouseSetupStep = (typeof HOUSE_SETUP_STEPS_EIGHT)[number] | (typeof HOUSE_SETUP_STEPS_SEVEN)[number];

export function houseSetupStepMeta(
  step: number,
  eightStep = isHouseSetupEightStepLive(),
): HouseSetupStep {
  const steps = houseSetupSteps(eightStep);
  const index = Math.min(steps.length, clampHouseSetupStep(step, eightStep)) - 1;
  return steps[Math.max(0, index)];
}

export function nextHouseSetupStep(
  step: number,
  eightStep = isHouseSetupEightStepLive(),
): number {
  return Math.min(houseSetupDoneStep(eightStep), clampHouseSetupStep(step, eightStep) + 1);
}

export function previousHouseSetupStep(
  step: number,
  eightStep = isHouseSetupEightStepLive(),
): number {
  return Math.max(HOUSE_SETUP_FIRST_STEP, clampHouseSetupStep(step, eightStep) - 1);
}

export function parseWeeklyBudgetDollars(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Enter a weekly budget in dollars, or leave it blank.");
  }
  return Math.round(n * 100);
}

export function formatWeeklyBudgetDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  if (!Number.isFinite(cents) || cents < 0) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function weeklyBudgetCurrencyPrefix(postalCode: string | null | undefined): "$" {
  const kind: PostalKind = postalCode?.trim() ? classifyPostalCode(postalCode).kind : "us";
  switch (kind) {
    case "us":
    case "ca":
    case "uk":
    case "unknown":
      return "$";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function clampHouseholdSize(value: unknown): number {
  if (typeof value === "number") return clampHeadcount(value);
  const n = Number(value);
  return clampHeadcount(Number.isFinite(n) ? n : 2);
}

export function parseBallotRequestStatus(value: unknown): "pending" | "fulfilled" | "cancelled" | null {
  switch (value) {
    case "pending":
    case "fulfilled":
    case "cancelled":
      return value;
    default:
      return null;
  }
}
