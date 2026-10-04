"use client";

import { useEffect, useState } from "react";
import { useSupper } from "@/components/supper-provider";
import {
  WEEK_PROCESSING_CAP_MS,
  bindForegroundWeekRefresh,
  readProcessingClock,
  syncProcessingClock,
  writeProcessingClock,
  type ProcessingPhase,
} from "@/lib/foreground-week-refresh";

export function useForegroundWeekRefresh(input: {
  weekId: string | null;
  waiting: boolean;
  signature: string;
}): { phase: ProcessingPhase; announce: boolean; stretchKey: string } {
  const { refetchViewedWeek, setForegroundWeekTarget } = useSupper();
  const { weekId, waiting, signature } = input;
  const [clockPhase, setClockPhase] = useState<ProcessingPhase>("off");
  const [liveKey, setLiveKey] = useState<string | null>(null);
  const stretchKey = weekId ? `${weekId}:${signature}` : "off";
  const phase: ProcessingPhase = !weekId || !waiting ? "off" : clockPhase;
  const announce = Boolean(weekId && waiting && phase === "bar" && liveKey === stretchKey);

  useEffect(() => {
    if (!weekId) {
      setForegroundWeekTarget(null);
      return;
    }
    setForegroundWeekTarget(weekId);
    const unbind = bindForegroundWeekRefresh({
      document,
      refresh: () => {
        void refetchViewedWeek(weekId);
      },
    });
    return () => {
      unbind();
      setForegroundWeekTarget(null);
    };
  }, [weekId, refetchViewedWeek, setForegroundWeekTarget]);

  useEffect(() => {
    if (!weekId || !waiting) {
      if (weekId) writeProcessingClock(weekId, null);
      return;
    }

    let timer: number | null = null;
    let cancelled = false;
    const clearTimer = () => {
      if (timer == null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const step = (active: boolean) => {
      if (cancelled) return;
      const foreground = active && !document.hidden;
      const result = syncProcessingClock(readProcessingClock(weekId), {
        weekId,
        signature,
        waiting: true,
        active: foreground,
        now: Date.now(),
      });
      writeProcessingClock(weekId, result.clock);
      setClockPhase(result.phase);
      if (result.announce) setLiveKey(`${weekId}:${signature}`);
      clearTimer();
      if (!foreground || result.phase !== "bar" || result.clock == null || result.clock.runningSince == null) {
        return;
      }
      const total =
        result.clock.accumulatedMs + Math.max(0, Date.now() - result.clock.runningSince);
      const remaining = WEEK_PROCESSING_CAP_MS - total;
      timer = window.setTimeout(() => step(true), Math.max(0, remaining));
    };

    const onVisibility = () => {
      step(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const start = window.setTimeout(() => step(!document.hidden), 0);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimer();
      const paused = syncProcessingClock(readProcessingClock(weekId), {
        weekId,
        signature,
        waiting: true,
        active: false,
        now: Date.now(),
      });
      writeProcessingClock(weekId, paused.clock);
    };
  }, [weekId, waiting, signature]);

  return { phase, announce, stretchKey };
}
