"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { WeekNavigator } from "@/components/week-navigator";
import { useSupper } from "@/components/supper-provider";
import { useViewedWeek } from "@/components/use-viewed-week";
import { todayInTimeZone } from "@/lib/meal-history";
import { recipeNightsForWeek } from "@/lib/recipes";
import { nightHasStripMeal, stripCellMuted } from "@/lib/week-chrome";
import { navigatorHref, selectionFromStop, stepNavigator } from "@/lib/week-navigator";

/**
 * The same week strip as Meals, pinned on List. Swipe / ‹ › change the shared week.
 * Only Meals' future swipe creates a planning week, so here the › soft-stops at the edge.
 */
export function ListWeekStrip() {
  const router = useRouter();
  const { snapshot } = useSupper();
  const { scope, past, stops, index, setViewedWeek } = useViewedWeek();
  const onStep = useCallback(
    (direction: -1 | 1) => {
      const result = stepNavigator(stops, index, direction);
      if (!result.moved) return false;
      const selection = selectionFromStop(result.stop);
      setViewedWeek(selection);
      router.replace(navigatorHref(selection, "/list"), { scroll: false });
      return true;
    },
    [index, router, setViewedWeek, stops],
  );
  if (!snapshot) return null;
  const todayIso = todayInTimeZone(new Date(), snapshot.household.timezone);
  const nights = past
    ? past.nights.map((night) => ({ id: night.nightDate, nightDate: night.nightDate, hasMeal: true }))
    : scope
      ? recipeNightsForWeek(scope.meals).map((meal) => ({
          id: meal.id,
          nightDate: meal.nightDate,
          hasMeal: nightHasStripMeal(meal, scope.votes, snapshot.memberships),
        }))
      : [];
  const mutedDates = nights
    .filter((night) => stripCellMuted({ nightDate: night.nightDate, todayIso }))
    .map((night) => night.nightDate);
  const startsOn = stops[index]?.startsOn ?? snapshot.week.startsOn;
  const todayId = past ? null : (nights.find((night) => night.hasMeal && night.nightDate === todayIso)?.id ?? null);
  return (
    <div data-slot="list-week-strip">
      <WeekNavigator
        startsOn={startsOn}
        nights={nights}
        selectedMealId={todayId}
        todayIso={todayIso}
        locked={scope?.week.status === "locked"}
        mutedDates={mutedDates}
        interactive={false}
        onSelect={() => undefined}
        onStep={onStep}
      />
    </div>
  );
}
