import { weekdayIndexFromDate } from "./dates";
import type { Audience, Household } from "./types";

export const MIN_NIGHT_HEADCOUNT = 0;
export const MIN_HEADCOUNT = 1;
export const MAX_HEADCOUNT = 12;
export const DEFAULT_FAMILY_SIZE = 4;
export const DEFAULT_COUPLE_SIZE = 2;
export const DEFAULT_NIGHT_HEADCOUNTS = [4, 4, 4, 4, 4, 2, 2] as const;

export type NightKind = "off" | "solo" | "couple" | "family";

export function clampHeadcount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FAMILY_SIZE;
  return Math.min(MAX_HEADCOUNT, Math.max(MIN_HEADCOUNT, Math.round(value)));
}

/**
 * People count on Request a new dinner. Floor is 1. Missing values become 1,
 * never a house default of 2 or 4.
 */
export function dinnerRequestPeople(servings: number | null | undefined): number {
  if (typeof servings !== "number" || !Number.isFinite(servings)) return MIN_HEADCOUNT;
  return Math.min(MAX_HEADCOUNT, Math.max(MIN_HEADCOUNT, Math.round(servings)));
}

/** Write one weekday's plates. Other nights stay. Null week plates stay null. */
export function withNightServings(
  counts: number[] | null | undefined,
  nightDate: string,
  servings: number,
): number[] | null {
  if (!Array.isArray(counts) || counts.length !== 7) return counts ?? null;
  const next = [...counts];
  next[weekdayIndexFromDate(nightDate)] = dinnerRequestPeople(servings);
  return next;
}

export function clampNightHeadcount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FAMILY_SIZE;
  return Math.min(MAX_HEADCOUNT, Math.max(MIN_NIGHT_HEADCOUNT, Math.round(value)));
}

export function typicalWeekHeadcounts(
  familySize = DEFAULT_FAMILY_SIZE,
  coupleSize = DEFAULT_COUPLE_SIZE,
): number[] {
  const family = clampHeadcount(familySize);
  const couple = clampHeadcount(coupleSize);
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    weekday === 5 || weekday === 6 ? couple : family,
  );
}

export function typicalWeekLabel(
  familySize = DEFAULT_FAMILY_SIZE,
  coupleSize = DEFAULT_COUPLE_SIZE,
): string {
  return `Apply typical week: weeknights ${clampHeadcount(familySize)}, Fri/Sat ${clampHeadcount(coupleSize)}`;
}

export function typicalSizesFromHeadcounts(counts: number[]): {
  familySize: number;
  coupleSize: number;
} {
  const normalized = normalizeNightHeadcounts(counts);
  const weeknight = normalized.slice(0, 5).find((count) => count > 0);
  const weekend = normalized.slice(5).find((count) => count > 0);
  return {
    familySize: clampHeadcount(weeknight ?? DEFAULT_FAMILY_SIZE),
    coupleSize: clampHeadcount(weekend ?? DEFAULT_COUPLE_SIZE),
  };
}

export function normalizeNightHeadcounts(
  input?: number[] | null,
  fallback?: Pick<Household, "coupleNights" | "familySize" | "coupleSize"> | Partial<Household>,
): number[] {
  if (Array.isArray(input) && input.length === 7) {
    return input.map(clampNightHeadcount);
  }
  const family = clampHeadcount(fallback?.familySize ?? DEFAULT_FAMILY_SIZE);
  const couple = clampHeadcount(fallback?.coupleSize ?? DEFAULT_COUPLE_SIZE);
  const coupleNights = fallback?.coupleNights ?? [5, 6];
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    coupleNights.includes(weekday) ? couple : family,
  );
}

export function audienceFromHeadcount(count: number): Audience {
  return clampNightHeadcount(count) === DEFAULT_COUPLE_SIZE ? "couple" : "family";
}

export function nightKindFromHeadcount(count: number): NightKind {
  switch (clampNightHeadcount(count)) {
    case 0:
      return "off";
    case 1:
      return "solo";
    case 2:
      return "couple";
    default:
      return "family";
  }
}

export function nightKindLabel(count: number): string {
  const kind = nightKindFromHeadcount(count);
  switch (kind) {
    case "off":
      return "Off night";
    case "solo":
      return "Solo night";
    case "couple":
      return "Couple night";
    case "family":
      return "Family night";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function coupleNightsFromHeadcounts(counts: number[]): number[] {
  return normalizeNightHeadcounts(counts)
    .map((count, weekday) => (count === DEFAULT_COUPLE_SIZE ? weekday : -1))
    .filter((weekday) => weekday >= 0);
}

export function headcountForNight(
  household: Pick<Household, "nightHeadcounts" | "coupleNights" | "familySize" | "coupleSize">,
  nightDate: string,
): number {
  return normalizeNightHeadcounts(household.nightHeadcounts, household)[
    weekdayIndexFromDate(nightDate)
  ];
}

export function servingsLabel(count: number): string {
  const n = clampNightHeadcount(count);
  if (n === 0) return "No dinner";
  return n === 1 ? "1 person" : `${n} people`;
}

export function withDerivedNightSettings(
  household: Household,
  nightHeadcounts: number[],
): Household {
  const counts = normalizeNightHeadcounts(nightHeadcounts, household);
  return {
    ...household,
    nightHeadcounts: counts,
    coupleNights: coupleNightsFromHeadcounts(counts),
    familySize: household.familySize || DEFAULT_FAMILY_SIZE,
    coupleSize: household.coupleSize || DEFAULT_COUPLE_SIZE,
  };
}
