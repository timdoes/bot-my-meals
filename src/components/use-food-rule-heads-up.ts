"use client";

import { useCallback, useMemo, useState } from "react";
import { useSupper } from "@/components/supper-provider";
import { useViewedWeek } from "@/components/use-viewed-week";
import {
  findMealForDayName,
  foodRuleHeadsUpLine,
  headsUpForText,
} from "@/lib/food-rule-check";

export function useOptionalSupper() {
  try {
    return useSupper();
  } catch {
    return null;
  }
}

export function usePreferredWeekId(): string | undefined {
  try {
    return useViewedWeek().scope?.week.id;
  } catch {
    return undefined;
  }
}

export function useFoodRuleHeadsUp(input: { text: string; dayName: string }) {
  const supper = useOptionalSupper();
  const preferWeekId = usePreferredWeekId();
  const snapshot = supper?.snapshot ?? null;
  const token = `${input.dayName}\n${input.text}`;
  const [phase, setPhase] = useState<{ token: string; mode: "idle" | "pending" | "anyway" }>({
    token,
    mode: "idle",
  });
  const mode = phase.token === token ? phase.mode : "idle";

  const hit = useMemo(() => {
    if (!snapshot) return null;
    const meal = findMealForDayName(snapshot, input.dayName, preferWeekId);
    if (!meal) return null;
    return headsUpForText(snapshot, meal.weekId, meal.dayIndex, input.text);
  }, [snapshot, preferWeekId, input.dayName, input.text]);

  const trySend = useCallback(() => {
    if (hit && mode !== "anyway") {
      setPhase({ token, mode: "pending" });
      return false;
    }
    setPhase({ token, mode: "idle" });
    return true;
  }, [hit, mode, token]);

  const requestAnyway = useCallback(() => {
    setPhase({ token, mode: "anyway" });
  }, [token]);

  const requestSomethingElse = useCallback(() => {
    setPhase({ token, mode: "idle" });
  }, [token]);

  return {
    warning: mode === "pending" && hit ? foodRuleHeadsUpLine(hit) : null,
    pending: mode === "pending",
    trySend,
    requestAnyway,
    requestSomethingElse,
  };
}
