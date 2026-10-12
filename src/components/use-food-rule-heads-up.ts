"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [pending, setPending] = useState(false);
  const [anyway, setAnyway] = useState(false);

  useEffect(() => {
    setPending(false);
    setAnyway(false);
  }, [input.text, input.dayName]);

  const hit = useMemo(() => {
    if (!snapshot) return null;
    const meal = findMealForDayName(snapshot, input.dayName, preferWeekId);
    if (!meal) return null;
    return headsUpForText(snapshot, meal.weekId, meal.dayIndex, input.text);
  }, [snapshot, preferWeekId, input.dayName, input.text]);

  const trySend = useCallback(() => {
    if (hit && !anyway) {
      setPending(true);
      return false;
    }
    setPending(false);
    return true;
  }, [hit, anyway]);

  const requestAnyway = useCallback(() => {
    setAnyway(true);
    setPending(false);
  }, []);

  const requestSomethingElse = useCallback(() => {
    setPending(false);
    setAnyway(false);
  }, []);

  return {
    warning: pending && hit ? foodRuleHeadsUpLine(hit) : null,
    pending,
    trySend,
    requestAnyway,
    requestSomethingElse,
  };
}
