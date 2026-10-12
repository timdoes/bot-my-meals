import { formatWeekRange } from "./dates";
import { HISTORY_UI_LIMIT } from "./meal-history";
import { NEXT_WEEK_LABEL, THIS_WEEK_LABEL } from "./open-weeks";

/** Clear horizontal travel before a week snap. Day taps stay under this. */
export const WEEK_SWIPE_THRESHOLD_PX = 48;

export const PAST_EYEBROW = "Past";
export const PAST_TITLES_ONLY = "Titles only";
export const EARLIER_WEEK_LABEL = "Earlier week";
export const LATER_WEEK_LABEL = "Later week";

export type NavigatorStop =
  | { kind: "past"; startsOn: string }
  | { kind: "cooking"; startsOn: string }
  | { kind: "planning"; startsOn: string };

export type ViewedWeekSelection =
  | { kind: "cooking" }
  | { kind: "planning" }
  | { kind: "past"; startsOn: string };

/**
 * Oldest finished week → cooking → planning.
 * History is capped at the same 26 weeks as the Past weeks list.
 * A third open week is never added.
 */
export function navigatorStops(input: {
  historyStartsOn: readonly string[];
  cookingStartsOn: string;
  planningStartsOn: string | null;
}): NavigatorStop[] {
  const blocked = new Set(
    [input.cookingStartsOn, input.planningStartsOn].filter((startsOn): startsOn is string =>
      Boolean(startsOn),
    ),
  );
  const past = [...new Set(input.historyStartsOn)]
    .filter((startsOn) => startsOn < input.cookingStartsOn && !blocked.has(startsOn))
    .sort((a, b) => a.localeCompare(b))
    .slice(-HISTORY_UI_LIMIT);

  const stops: NavigatorStop[] = past.map((startsOn) => ({ kind: "past", startsOn }));
  stops.push({ kind: "cooking", startsOn: input.cookingStartsOn });
  if (input.planningStartsOn && input.planningStartsOn !== input.cookingStartsOn) {
    stops.push({ kind: "planning", startsOn: input.planningStartsOn });
  }
  return stops;
}

export function resolveNavigatorIndex(
  stops: readonly NavigatorStop[],
  selection: ViewedWeekSelection,
): number {
  if (selection.kind === "past") {
    const pastIndex = stops.findIndex(
      (stop) => stop.kind === "past" && stop.startsOn === selection.startsOn,
    );
    if (pastIndex >= 0) return pastIndex;
  }
  if (selection.kind === "planning") {
    const planningIndex = stops.findIndex((stop) => stop.kind === "planning");
    if (planningIndex >= 0) return planningIndex;
  }
  const cookingIndex = stops.findIndex((stop) => stop.kind === "cooking");
  return cookingIndex >= 0 ? cookingIndex : 0;
}

export function stepNavigator(
  stops: readonly NavigatorStop[],
  index: number,
  direction: -1 | 1,
): { index: number; stop: NavigatorStop; moved: boolean } {
  const current = stops[index] ?? stops[0];
  if (!current) {
    return {
      index: 0,
      stop: { kind: "cooking", startsOn: "" },
      moved: false,
    };
  }
  const nextIndex = index + direction;
  const next = stops[nextIndex];
  if (!next) return { index, stop: current, moved: false };
  return { index: nextIndex, stop: next, moved: true };
}

export function selectionFromStop(stop: NavigatorStop): ViewedWeekSelection {
  switch (stop.kind) {
    case "past":
      return { kind: "past", startsOn: stop.startsOn };
    case "cooking":
      return { kind: "cooking" };
    case "planning":
      return { kind: "planning" };
    default: {
      const _exhaustive: never = stop;
      return _exhaustive;
    }
  }
}

/** Query string (with `?`) that carries the viewed week between Meals, List and recipe pages. */
export function weekQuery(selection: ViewedWeekSelection): string {
  switch (selection.kind) {
    case "cooking":
      return "";
    case "planning":
      return "?week=next";
    case "past":
      return `?past=${selection.startsOn}`;
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

/** Meals and List share one week: same params on both tabs. */
export function navigatorHref(selection: ViewedWeekSelection, base: "/week" | "/list" = "/week"): string {
  switch (selection.kind) {
    case "cooking":
      return base;
    case "planning":
      return `${base}?week=next`;
    case "past":
      return `${base}?past=${selection.startsOn}`;
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

export function navigatorTitle(stop: NavigatorStop): string {
  switch (stop.kind) {
    case "cooking":
      return THIS_WEEK_LABEL;
    case "planning":
      return NEXT_WEEK_LABEL;
    case "past":
      return formatWeekRange(stop.startsOn);
    default: {
      const _exhaustive: never = stop;
      return _exhaustive;
    }
  }
}

export function navigatorEyebrow(stop: NavigatorStop): { text: string; muted: boolean } {
  switch (stop.kind) {
    case "past":
      return { text: PAST_EYEBROW, muted: true };
    case "cooking":
    case "planning":
      return { text: formatWeekRange(stop.startsOn), muted: false };
    default: {
      const _exhaustive: never = stop;
      return _exhaustive;
    }
  }
}

/**
 * Horizontal pan changes week. Vertical pan is the page scroll.
 * Finger left (negative dx) moves toward newer weeks. Finger right moves toward older weeks.
 * Returns null when the gesture is not a clear horizontal week snap.
 */
export function commitWeekSwipe(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dy) > Math.abs(dx)) return null;
  if (Math.abs(dx) < WEEK_SWIPE_THRESHOLD_PX) return null;
  return dx < 0 ? 1 : -1;
}

/**
 * Future edge from cooking, with no planning row, creates next week.
 * A further swipe from planning does not. Week-after-next is never created.
 */
export function futureSwipeCreatesPlanning(input: {
  direction: -1 | 1;
  moved: boolean;
  kind: NavigatorStop["kind"] | undefined;
  hasPlanning: boolean;
  canPlan: boolean;
}): boolean {
  return (
    input.direction === 1 &&
    !input.moved &&
    input.kind === "cooking" &&
    !input.hasPlanning &&
    input.canPlan
  );
}
