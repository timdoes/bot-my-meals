/**
 * Refresh schedule after an explicit wake (Check now, Create, Lock, Save that needs the bot).
 * Read-only: a tick rereads saved data and never wakes the bot. Foreground only: nothing
 * runs while the document is hidden, and coming back refreshes once and carries on.
 */

/** Fast stretch right after the wake. */
export const BURST_FAST_MS = 5_000;
export const BURST_FAST_WINDOW_MS = 120_000;
/** Slower stretch after that, until the whole burst ends. */
export const BURST_SLOW_MS = 15_000;
export const BURST_TOTAL_MS = 300_000;

/** Delay before the next tick, or null once the burst is over. `elapsedMs` is time since the wake. */
export function burstDelayMs(elapsedMs: number): number | null {
  if (elapsedMs >= BURST_TOTAL_MS) return null;
  return elapsedMs < BURST_FAST_WINDOW_MS ? BURST_FAST_MS : BURST_SLOW_MS;
}

export type BurstEnv = {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  isHidden: () => boolean;
  /** Fires `onChange` whenever visibility may have changed. Returns an unsubscribe. */
  subscribe: (onChange: () => void) => () => void;
};

/**
 * start() refreshes now and then on the schedule. Hidden pauses it (no timer, no refresh);
 * becoming visible refreshes once and resumes. stop() ends it. `onEnd` runs once when the
 * burst finishes by time or by stop().
 */
export function createBurst(input: { env: BurstEnv; refresh: () => void; onEnd?: () => void }) {
  const { env } = input;
  let timer: number | null = null;
  let startedAt = 0;
  let running = false;
  let unsubscribe: (() => void) | null = null;

  const clear = () => {
    if (timer == null) return;
    env.clearTimeout(timer);
    timer = null;
  };

  const finish = () => {
    if (!running) return;
    running = false;
    clear();
    unsubscribe?.();
    unsubscribe = null;
    input.onEnd?.();
  };

  const schedule = () => {
    clear();
    if (!running || env.isHidden()) return;
    const delay = burstDelayMs(env.now() - startedAt);
    if (delay == null) {
      finish();
      return;
    }
    timer = env.setTimeout(() => {
      timer = null;
      if (!running || env.isHidden()) return;
      if (burstDelayMs(env.now() - startedAt) == null) {
        finish();
        return;
      }
      input.refresh();
      schedule();
    }, delay);
  };

  const onVisibility = () => {
    if (!running) return;
    if (env.isHidden()) {
      clear();
      return;
    }
    if (burstDelayMs(env.now() - startedAt) == null) {
      finish();
      return;
    }
    input.refresh();
    schedule();
  };

  return {
    start() {
      const wasRunning = running;
      clear();
      running = true;
      startedAt = env.now();
      if (!wasRunning) unsubscribe = env.subscribe(onVisibility);
      if (!env.isHidden()) input.refresh();
      schedule();
    },
    stop() {
      finish();
    },
    isRunning: () => running,
  };
}

export function browserBurstEnv(): BurstEnv {
  return {
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    isHidden: () => document.visibilityState !== "visible",
    subscribe: (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

/** The line shown from the moment the wake is accepted until new content arrives or the burst ends. */
export const BOT_WORKING_LINE = "Your bot is working on it.";

/**
 * Working state: starts when a wake is accepted, clears when the viewed week's content
 * signature changes, or when the burst ends (including needs_work turning false).
 */
export function nextBotWorking(
  state: { working: boolean; since: string },
  event: { type: "wake"; signature: string } | { type: "signature"; signature: string } | { type: "end" },
): { working: boolean; since: string } {
  switch (event.type) {
    case "wake":
      return { working: true, since: event.signature };
    case "signature":
      return state.working && event.signature !== state.since ? { working: false, since: event.signature } : state;
    case "end":
      return state.working ? { working: false, since: state.since } : state;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
