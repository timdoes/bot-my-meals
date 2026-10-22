"use client";

import Link from "next/link";
import {
  HISTORY_UI_LIMIT,
  PAST_WEEKS_EMPTY,
  historyDinnerCount,
  historyNightLine,
  historyWeekRowLabel,
} from "@/lib/meal-history";
import type { MealHistoryWeek } from "@/lib/types";
import { PAST_TITLES_ONLY, navigatorHref } from "@/lib/week-navigator";
import { nightCardAnchorId } from "@/lib/week-strip";

export function PastWeeksList({ weeks }: { weeks: MealHistoryWeek[] }) {
  const visible = weeks.slice(0, HISTORY_UI_LIMIT);
  if (visible.length === 0) {
    return (
      <p data-slot="past-weeks-empty" className="type-body text-muted-foreground">
        {PAST_WEEKS_EMPTY}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {visible.map((week) => (
        <li key={week.startsOn}>
          <Link
            href={navigatorHref({ kind: "past", startsOn: week.startsOn })}
            data-slot="past-week-row"
            className="type-body flex min-h-12 items-center rounded-[14px] bg-card px-5 shadow-card"
          >
            {historyWeekRowLabel(week.startsOn, historyDinnerCount(week.nights))}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PastWeekDetail({ week }: { week: MealHistoryWeek }) {
  return (
    <div data-slot="past-week-detail">
      <p data-slot="past-titles-only" className="type-meta text-muted-foreground">
        {PAST_TITLES_ONLY}
      </p>
      <ul className="mt-4 space-y-3">
        {week.nights.map((night) => (
          <li
            key={night.nightDate}
            id={nightCardAnchorId(night.nightDate)}
            tabIndex={-1}
            data-slot="past-week-night"
            data-not-planned={night.notPlanned ? "true" : "false"}
            className={`type-body scroll-mt-[calc(var(--shell-head-h)+0.25rem)] rounded-[14px] px-5 py-4 outline-none focus:ring-2 focus:ring-primary/40 ${
              night.notPlanned
                ? "bg-muted text-slate-600 shadow-none"
                : "bg-card shadow-card"
            }`}
          >
            {historyNightLine(night)}
          </li>
        ))}
      </ul>
    </div>
  );
}
