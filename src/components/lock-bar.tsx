"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useSupper } from "@/components/supper-provider";
import { useViewedWeek } from "@/components/use-viewed-week";
import { Button } from "@/components/ui/button";
import { FOOD_RULE_NEEDS_CHANGE, weekAllergyLockHits } from "@/lib/food-rule-check";
import { checkWeekLock, mapFoodRuleActionError } from "@/lib/lock";
import { todayInTimeZone } from "@/lib/meal-history";
import {
  lockBarLabel,
  lockBarSubline,
  lockDinnerCount,
  weekHasPastNight,
} from "@/lib/week-chrome";

export function LockBar() {
  const { snapshot, lockWeek, error } = useSupper();
  const { scope } = useViewedWeek();
  const [busy, setBusy] = useState(false);
  if (!snapshot || !scope) return null;

  const locked = scope.week.status === "locked";
  const todayIso = todayInTimeZone(new Date(), snapshot.household.timezone);
  const check = checkWeekLock(scope.meals, scope.votes, snapshot.memberships, todayIso);
  const dinnerCount = lockDinnerCount(scope.meals, scope.votes, snapshot.memberships, todayIso);
  const hasPastNight = weekHasPastNight(scope.meals, todayIso);
  const allergyHits = weekAllergyLockHits(snapshot, scope.week.id, todayIso);
  const foodRuleBlock = allergyHits.length > 0;
  if (locked || !check.ready || dinnerCount === 0) return null;

  const displayError = error ? mapFoodRuleActionError(error) : foodRuleBlock ? FOOD_RULE_NEEDS_CHANGE : null;
  const label = lockBarLabel({ busy, hasPastNight });

  return (
    <div
      data-slot="lock-bar"
      data-state="ready"
      data-food-rule={foodRuleBlock ? "blocked" : undefined}
      className="rounded-[14px] bg-card p-3 shadow-card"
    >
      <Button
        size="fat"
        variant="primary"
        className="w-full gap-2 shadow-float"
        disabled={busy || foodRuleBlock}
        aria-busy={busy}
        onClick={() => {
          if (foodRuleBlock) return;
          setBusy(true);
          void lockWeek()
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Lock className="size-5" />}
        {label}
      </Button>
      <p data-slot="lock-bar-subline" className="type-meta mt-2 text-center text-muted-foreground">
        {lockBarSubline({ dinnerCount, hasPastNight })}
      </p>
      {displayError ? <p className="type-meta mt-2 text-destructive">{displayError}</p> : null}
    </div>
  );
}
