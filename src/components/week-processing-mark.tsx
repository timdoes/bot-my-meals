"use client";

import { BOT_WORKING_LINE } from "@/lib/wake-refresh-schedule";
import {
  STILL_PROCESSING_LINE,
  UPDATING_WEEK_ANNOUNCEMENT,
  type ProcessingPhase,
} from "@/lib/foreground-week-refresh";

export function WeekProcessingMark({
  phase,
  stretchKey,
  announce,
  working = false,
}: {
  phase: ProcessingPhase;
  stretchKey: string;
  announce: boolean;
  /** A wake was just accepted and new content has not arrived yet. */
  working?: boolean;
}) {
  if (phase === "off" && !working) return null;

  return (
    <div data-slot="week-processing" data-phase={phase} className="px-5 pb-2">
      {working ? (
        <p data-slot="bot-working" role="status" className="type-meta text-foreground">
          {BOT_WORKING_LINE}
        </p>
      ) : null}
      {phase === "bar" ? (
        <div
          data-slot="week-processing-bar"
          className="week-processing-track"
          style={{ height: 2, width: 120, maxWidth: 120 }}
          aria-hidden="true"
        >
          <span data-slot="week-processing-fill" className="week-processing-fill" />
        </div>
      ) : phase === "capped" ? (
        <p data-slot="still-processing" className="type-meta text-foreground">
          {STILL_PROCESSING_LINE}
        </p>
      ) : null}
      {announce && phase === "bar" ? (
        <span key={stretchKey} className="sr-only" aria-live="polite">
          {UPDATING_WEEK_ANNOUNCEMENT}
        </span>
      ) : null}
    </div>
  );
}
