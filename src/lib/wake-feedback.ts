import type { WakeClientResult } from "@/lib/bot-wake-client";
import { BOT_WAKE_DEBOUNCE_MS } from "@/lib/bot-wake";
import { BURST_FAST_MS, BURST_TOTAL_MS } from "@/lib/wake-refresh-schedule";

/** Matches the wake POST debounce so a second tap is not a second wake. */
export const WAKE_COOLDOWN_MS = BOT_WAKE_DEBOUNCE_MS;

/**
 * Light refetch while a wake or Save still has bot work in flight: every 5 s for 2 minutes,
 * then every 15 s until 5 minutes in (src/lib/wake-refresh-schedule.ts). Foreground only.
 */
export const PENDING_REFRESH_INTERVAL_MS = BURST_FAST_MS;
export const PENDING_REFRESH_WINDOW_MS = BURST_TOTAL_MS;

export const WAKE_WAKING_LABEL = "Waking\u2026";
export const WAKE_CHECKING_LABEL = "Checking\u2026";
export const WAKE_COOLDOWN_LABEL = "Bot notified";
export const WAKE_MESSAGE_CONTINUE = "Message your bot to continue";
export const WAKE_ASKED_MESSAGE = "Asked you to message your bot";

export const WAKE_MEALS_PENDING_BODY =
  "Your Bot My Meals bot is working on this. Meals show up here when ready.";
export const WAKE_MEALS_NOTIFIED =
  "Your bot was notified. Meals show up here when ready.";
export const WAKE_CHECK_HINT = "Wakes your bot. You\u2019ll see updates here when it\u2019s done.";

export const AWAITING_MEAL_LABEL = "Waiting for a meal\u2026";

export const WAKE_PHASES = ["idle", "waking", "cooldown"] as const;
export type WakePhase = (typeof WAKE_PHASES)[number];

export function wakeControlLabel(
  phase: WakePhase,
  idleLabel: string,
  wakingLabel: string,
): string {
  switch (phase) {
    case "idle":
      return idleLabel;
    case "waking":
      return wakingLabel;
    case "cooldown":
      return WAKE_COOLDOWN_LABEL;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

/** A posted or debounced wake holds the control. Anything else returns to idle. */
export function wakeSettledPhase(result: WakeClientResult | void): WakePhase {
  if (result == null) return "idle";
  switch (result) {
    case "posted":
    case "debounced":
      return "cooldown";
    case "failed":
    case "unset":
    case "skipped":
      return "idle";
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
