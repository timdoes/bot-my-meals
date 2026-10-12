"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WeekStrip } from "@/components/week-strip";
import {
  EARLIER_WEEK_LABEL,
  LATER_WEEK_LABEL,
  commitWeekSwipe,
} from "@/lib/week-navigator";
import type { WeekStripNight } from "@/lib/week-strip";
import { cn } from "@/lib/utils";

export function WeekNavigator({
  startsOn,
  nights,
  selectedMealId,
  todayIso,
  locked = false,
  mutedDates = [],
  onSelect,
  onStep,
  interactive = true,
}: {
  startsOn: string;
  nights: readonly WeekStripNight[];
  selectedMealId: string | null;
  todayIso: string;
  locked?: boolean;
  mutedDates?: readonly string[];
  onSelect: (mealId: string) => void;
  /** -1 is older, +1 is newer. False means the continuum edge (soft stop). */
  onStep: (direction: -1 | 1) => boolean;
  /** False on List: same strip, cells are not buttons. */
  interactive?: boolean;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const bounceTimer = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);

  const clearBounce = () => {
    if (bounceTimer.current == null) return;
    window.clearTimeout(bounceTimer.current);
    bounceTimer.current = null;
  };

  const finishStep = (direction: -1 | 1) => {
    clearBounce();
    const moved = onStep(direction);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!moved || reduce) {
      if (!moved && !reduce) {
        setAnimate(true);
        setOffset(direction > 0 ? -16 : 16);
        bounceTimer.current = window.setTimeout(() => setOffset(0), 180);
        return;
      }
      setAnimate(false);
      setOffset(0);
      return;
    }
    setAnimate(false);
    setOffset(direction > 0 ? 28 : -28);
    window.requestAnimationFrame(() => {
      setAnimate(true);
      setOffset(0);
    });
  };

  return (
    <div data-slot="week-navigator" className="relative h-[52px] overflow-x-clip bg-secondary">
      <div
        className="h-full overflow-hidden"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          origin.current = { x: event.clientX, y: event.clientY };
          clearBounce();
          setAnimate(false);
        }}
        onPointerMove={(event) => {
          const start = origin.current;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dy) > Math.abs(dx)) return;
          if (Math.abs(dx) < 8) return;
          setOffset(Math.max(-28, Math.min(28, dx)));
        }}
        onPointerUp={(event) => {
          const start = origin.current;
          origin.current = null;
          if (!start) return;
          const direction = commitWeekSwipe(event.clientX - start.x, event.clientY - start.y);
          if (!direction) {
            setAnimate(true);
            setOffset(0);
            return;
          }
          swallowClick.current = true;
          finishStep(direction);
        }}
        onPointerCancel={() => {
          origin.current = null;
          setAnimate(true);
          setOffset(0);
        }}
      >
        <div
          className={cn(
            "h-full touch-pan-y",
            animate && "transition-transform duration-200 motion-reduce:transition-none",
          )}
          style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
        >
          <WeekStrip
            startsOn={startsOn}
            nights={nights}
            selectedMealId={selectedMealId}
            todayIso={todayIso}
            locked={locked}
            mutedDates={mutedDates}
            interactive={interactive}
            onSelect={(mealId) => {
              if (swallowClick.current) {
                swallowClick.current = false;
                return;
              }
              onSelect(mealId);
            }}
          />
        </div>
      </div>
      <div
        aria-hidden
        data-slot="week-nav-fade"
        className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-secondary to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 bg-gradient-to-l from-secondary to-transparent"
      />
      <EdgeButton
        side="previous"
        label={EARLIER_WEEK_LABEL}
        onStep={() => finishStep(-1)}
      />
      <EdgeButton side="next" label={LATER_WEEK_LABEL} onStep={() => finishStep(1)} />
    </div>
  );
}

function EdgeButton({
  side,
  label,
  onStep,
}: {
  side: "previous" | "next";
  label: string;
  onStep: () => void;
}) {
  const Icon = side === "previous" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      data-slot={side === "previous" ? "week-nav-previous" : "week-nav-next"}
      aria-label={label}
      className={cn(
        "absolute top-0.5 z-30 grid h-12 w-11 place-items-center text-foreground",
        side === "previous" ? "left-0 -translate-x-3" : "right-0 translate-x-3",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={onStep}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
