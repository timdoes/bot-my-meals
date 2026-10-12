import type { ViewedWeekSelection } from "./week-navigator";

/** Session copy of the shared Meals/List week so a PWA resume without a URL param keeps it. */
export const WEEK_SESSION_KEY = "bmm.viewedWeek";
/** Back to the smart default after this long away (NAV-TABS lock §3). */
export const WEEK_AWAY_RESET_MS = 4 * 60 * 60 * 1000;

export function serializeWeekSession(selection: ViewedWeekSelection, nowMs: number): string {
  return JSON.stringify({ selection, at: nowMs });
}

function validSelection(value: unknown): ViewedWeekSelection | null {
  if (!value || typeof value !== "object") return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === "cooking" || kind === "planning") return { kind };
  if (kind === "past") {
    const startsOn = (value as { startsOn?: unknown }).startsOn;
    if (typeof startsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { kind, startsOn };
  }
  return null;
}

/** Null when missing, malformed, or older than four hours. */
export function parseWeekSession(raw: string | null, nowMs: number): ViewedWeekSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { selection?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || nowMs - parsed.at > WEEK_AWAY_RESET_MS || nowMs < parsed.at - 60_000) {
      return null;
    }
    return validSelection(parsed.selection);
  } catch {
    return null;
  }
}

export function awayLongEnoughToReset(hiddenAtMs: number | null, nowMs: number): boolean {
  return hiddenAtMs != null && nowMs - hiddenAtMs >= WEEK_AWAY_RESET_MS;
}

/** Selection named by `?week=` / `?past=`; null when the URL names none (or a bad one). */
export function selectionFromSearch(
  params: { get: (key: string) => string | null },
  known: { pastStartsOn: readonly string[]; hasPlanning: boolean },
): ViewedWeekSelection | null {
  const past = params.get("past");
  if (past && known.pastStartsOn.includes(past)) return { kind: "past", startsOn: past };
  const week = params.get("week");
  if (week === "next" && known.hasPlanning) return { kind: "planning" };
  if (week === "this") return { kind: "cooking" };
  return null;
}
