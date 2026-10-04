"use client";

import {
  STILL_PROCESSING_LINE,
  UPDATING_WEEK_ANNOUNCEMENT,
  type ProcessingPhase,
} from "@/lib/foreground-week-refresh";

export function WeekProcessingMark({
  phase,
  stretchKey,
  announce,
}: {
  phase: ProcessingPhase;
  stretchKey: string;
  announce: boolean;
}) {
  if (phase === "off") return null;

  return (
    <div data-slot="week-processing" data-phase={phase} className="px-5 pb-2">
      {phase === "bar" ? (
        <div
          data-slot="week-processing-bar"
          className="week-processing-track"
          style={{ height: 2, width: 120, maxWidth: 120 }}
          aria-hidden="true"
        >
          <span data-slot="week-processing-fill" className="week-processing-fill" />
        </div>
      ) : (
        <p data-slot="still-processing" className="type-meta text-foreground">
          {STILL_PROCESSING_LINE}
        </p>
      )}
      {announce && phase === "bar" ? (
        <span key={stretchKey} className="sr-only" aria-live="polite">
          {UPDATING_WEEK_ANNOUNCEMENT}
        </span>
      ) : null}
    </div>
  );
}
