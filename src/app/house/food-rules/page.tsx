"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { FoodRulesHome, isFoodRulesAvailable } from "@/components/food-rules";
import { useSupper } from "@/components/supper-provider";
import { FOOD_RULES_TITLE, isLastAttendeeError } from "@/lib/food-rules";
import { canActOnBallot } from "@/lib/lock";

export default function FoodRulesPage() {
  return (
    <AuthGate>
      <FoodRulesBody />
    </AuthGate>
  );
}

function FoodRulesBody() {
  const router = useRouter();
  const {
    snapshot,
    session,
    addEater,
    renameEater,
    removeEater,
    addFoodRule,
    updateFoodRule,
    removeFoodRule,
    markFoodRulesReviewed,
    allowMealAgain,
  } = useSupper();
  const available = isFoodRulesAvailable();
  const [lastAttendeeEaterId, setLastAttendeeEaterId] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot && !available) router.replace("/house");
  }, [available, router, snapshot]);

  useEffect(() => {
    if (!available || typeof window === "undefined") return;
    if (window.location.hash !== "#meals") return;
    document.getElementById("meals")?.scrollIntoView();
  }, [available, snapshot]);

  if (!available) {
    return (
      <AppShell title="House" backHref="/house" backLabel="House">
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  if (!snapshot) {
    return (
      <AppShell title={FOOD_RULES_TITLE} backHref="/house" backLabel="House">
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={FOOD_RULES_TITLE} backHref="/house" backLabel="House">
      <FoodRulesHome
        rules={snapshot.foodRules}
        eaters={snapshot.eaters}
        memberships={snapshot.memberships}
        mealDislikes={snapshot.mealDislikes}
        reviewedAt={snapshot.household.foodRulesReviewedAt}
        sessionMembershipId={session?.membershipId}
        canAct={canActOnBallot(session?.role)}
        lastAttendeeEaterId={lastAttendeeEaterId}
        onAddRule={(draft) => addFoodRule(draft)}
        onUpdateRule={(ruleId, draft) => updateFoodRule(ruleId, draft)}
        onRemoveRule={(ruleId) => removeFoodRule(ruleId)}
        onAddEater={(name) => addEater(name)}
        onRenameEater={(eaterId, name) => renameEater(eaterId, name)}
        onRemoveEater={async (eaterId) => {
          try {
            await removeEater(eaterId);
            setLastAttendeeEaterId(null);
          } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (isLastAttendeeError(message)) {
              setLastAttendeeEaterId(eaterId);
            }
            throw err;
          }
        }}
        onAllowMeal={(recipeKey) => allowMealAgain(recipeKey)}
        onMarkReviewed={() => markFoodRulesReviewed()}
      />
    </AppShell>
  );
}
