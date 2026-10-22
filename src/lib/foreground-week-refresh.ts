import { shouldWakeNeedsWork } from "@/lib/bot-wake";
import type { WeekScope } from "@/lib/types";

/** Refetch cadence while the viewed week is on screen and the document is visible. */
export const FOREGROUND_WEEK_REFRESH_MS = 30_000;

/** Coming back to the app rereads the week once; repeats inside this gap are ignored. */
export const RESUME_REFRESH_MIN_GAP_MS = 2_000;

/** Foreground time on one waiting stretch before the mark stops moving. */
export const WEEK_PROCESSING_CAP_MS = 5 * 60 * 1000;

export const STILL_PROCESSING_LINE = "Still processing.";
export const UPDATING_WEEK_ANNOUNCEMENT = "Updating this week.";

export type ProcessingPhase = "off" | "bar" | "capped";

export type ProcessingClock = {
  weekId: string;
  signature: string;
  accumulatedMs: number;
  runningSince: number | null;
  capped: boolean;
  announced: boolean;
};

export type VisibilityDocument = {
  readonly hidden: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

type IntervalHandle = ReturnType<typeof setInterval>;

const processingClocks = new Map<string, ProcessingClock>();

export function readProcessingClock(weekId: string): ProcessingClock | null {
  return processingClocks.get(weekId) ?? null;
}

export function writeProcessingClock(weekId: string, clock: ProcessingClock | null): void {
  if (clock == null) {
    processingClocks.delete(weekId);
    return;
  }
  processingClocks.set(weekId, clock);
}

export function resetProcessingClocks(): void {
  processingClocks.clear();
}

/** Stable fingerprint of the week a person is looking at. A bot write changes it. */
export function viewedWeekDataSignature(scope: WeekScope): string {
  const meals = [...scope.meals]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((meal) => ({
      id: meal.id,
      title: meal.title,
      pitch: meal.pitch,
      servings: meal.servings,
      nightDate: meal.nightDate,
      isLeftovers: meal.isLeftovers,
      audience: meal.audience,
    }));
  const votes = [...scope.votes]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((vote) => ({
      id: vote.id,
      mealId: vote.mealId,
      choice: vote.choice,
      note: vote.note,
    }));
  const recipes = [...scope.recipes]
    .sort((a, b) => a.mealId.localeCompare(b.mealId))
    .map((recipe) => ({
      mealId: recipe.mealId,
      steps: recipe.steps,
      ingredients: recipe.ingredients.map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
    }));
  const items = [...(scope.shoppingList?.items ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      checked: item.checked,
      quantity: item.quantity,
    }));
  return JSON.stringify({
    week: {
      id: scope.week.id,
      status: scope.week.status,
      lockedAt: scope.week.lockedAt,
      editableFrom: scope.week.editableFrom,
      plannedFrom: scope.week.plannedFrom,
      peopleConfirmedAt: scope.week.peopleConfirmedAt,
      nightHeadcounts: scope.week.nightHeadcounts,
      specialInstructions: scope.week.specialInstructions,
      shoppingPrompt: scope.week.shoppingPrompt,
    },
    meals,
    votes,
    recipes,
    items,
    ballot: scope.ballotRequest?.status ?? null,
  });
}

function elapsedMs(clock: ProcessingClock, now: number): number {
  if (clock.runningSince == null) return 0;
  return Math.max(0, now - clock.runningSince);
}

/**
 * Foreground time on the viewed week. Leaving pauses the clock and does not
 * reset it. A new week-data signature drops the stretch. After the cap, later
 * visits stay capped.
 */
export function syncProcessingClock(
  clock: ProcessingClock | null,
  input: {
    weekId: string | null;
    signature: string;
    waiting: boolean;
    active: boolean;
    now: number;
    capMs?: number;
  },
): { clock: ProcessingClock | null; phase: ProcessingPhase; announce: boolean } {
  const capMs = input.capMs ?? WEEK_PROCESSING_CAP_MS;
  if (!input.waiting || input.weekId == null) {
    return { clock: null, phase: "off", announce: false };
  }

  const same =
    clock != null && clock.weekId === input.weekId && clock.signature === input.signature;

  let next: ProcessingClock;
  if (!same) {
    next = {
      weekId: input.weekId,
      signature: input.signature,
      accumulatedMs: 0,
      runningSince: input.active ? input.now : null,
      capped: false,
      announced: false,
    };
  } else if (clock.capped) {
    next = { ...clock, runningSince: null };
  } else if (!input.active) {
    const total = clock.accumulatedMs + elapsedMs(clock, input.now);
    const capped = total >= capMs;
    next = {
      ...clock,
      accumulatedMs: capped ? capMs : total,
      runningSince: null,
      capped,
    };
  } else if (clock.runningSince == null) {
    next = { ...clock, runningSince: input.now };
  } else {
    const total = clock.accumulatedMs + elapsedMs(clock, input.now);
    if (total >= capMs) {
      next = { ...clock, accumulatedMs: capMs, runningSince: null, capped: true };
    } else {
      next = clock;
    }
  }

  let announce = false;
  if (input.active && !next.announced && !next.capped) {
    next = { ...next, announced: true };
    announce = true;
  }

  const phase: ProcessingPhase = next.capped ? "capped" : "bar";
  return { clock: next, phase, announce };
}

/** A foreground read may update the screen only while that same week is still the one on it. */
export function shouldPaintWeekRefetch(input: {
  requestedWeekId: string;
  viewingWeekId: string | null;
  screenActive: boolean;
}): boolean {
  return input.screenActive && input.viewingWeekId === input.requestedWeekId;
}

/** The foreground read never wakes the bot, even when work appears in the saved week. */
export function shouldWakeAfterRefresh(input: {
  fromPoll: boolean;
  previous: boolean | null;
  next: boolean;
}): boolean {
  if (input.fromPoll) return false;
  return shouldWakeNeedsWork(input.previous, input.next);
}

export function createViewedWeekRefetch<T>(input: {
  load: (weekId: string) => Promise<T | null>;
  paint: (weekId: string, data: T) => void;
  viewing: () => { weekId: string | null; screenActive: boolean };
}): (weekId: string) => Promise<void> {
  let inFlight = false;
  return async (weekId: string) => {
    if (inFlight) return;
    inFlight = true;
    try {
      const data = await input.load(weekId);
      if (data == null) return;
      const view = input.viewing();
      if (
        !shouldPaintWeekRefetch({
          requestedWeekId: weekId,
          viewingWeekId: view.weekId,
          screenActive: view.screenActive,
        })
      ) {
        return;
      }
      input.paint(weekId, data);
    } catch {
      // A failed read leaves the week already on screen.
    } finally {
      inFlight = false;
    }
  };
}

/**
 * Page timer only. Hidden documents and leaving the week clear it.
 * Coming back (visibility, window focus or pageshow) rereads the week once right away
 * and starts a fresh interval. Never fires while hidden and never wakes the bot.
 */
export function bindForegroundWeekRefresh(input: {
  refresh: () => void;
  document: VisibilityDocument;
  /** Optional window-like target for focus and pageshow. */
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  setIntervalFn?: (callback: () => void, ms: number) => IntervalHandle;
  clearIntervalFn?: (handle: IntervalHandle) => void;
}): () => void {
  const setIntervalFn = input.setIntervalFn ?? ((callback, ms) => setInterval(callback, ms));
  const clearIntervalFn = input.clearIntervalFn ?? ((handle) => clearInterval(handle));
  let attached = true;
  let handle: IntervalHandle | null = null;

  const stop = () => {
    if (handle == null) return;
    const current = handle;
    handle = null;
    clearIntervalFn(current);
  };

  const tick = () => {
    if (!attached || input.document.hidden) {
      stop();
      return;
    }
    input.refresh();
  };

  const start = () => {
    if (!attached || input.document.hidden) {
      stop();
      return;
    }
    if (handle != null) return;
    handle = setIntervalFn(tick, FOREGROUND_WEEK_REFRESH_MS);
  };

  let lastResumeAt = 0;
  const onResume = () => {
    if (!attached || input.document.hidden) {
      stop();
      return;
    }
    start();
    const now = Date.now();
    // visibilitychange, focus and pageshow often arrive together: one read is enough.
    if (now - lastResumeAt < RESUME_REFRESH_MIN_GAP_MS) return;
    lastResumeAt = now;
    input.refresh();
  };

  input.document.addEventListener("visibilitychange", onResume);
  input.win?.addEventListener("focus", onResume);
  input.win?.addEventListener("pageshow", onResume);
  start();

  return () => {
    attached = false;
    input.document.removeEventListener("visibilitychange", onResume);
    input.win?.removeEventListener("focus", onResume);
    input.win?.removeEventListener("pageshow", onResume);
    stop();
  };
}
