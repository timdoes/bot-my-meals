"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { BallotToast } from "@/components/ballot-toast";
import { FavoritesList } from "@/components/saved-meals";
import { useSupper } from "@/components/supper-provider";
import { canActOnBallot } from "@/lib/lock";
import { dinnerRecipeReady } from "@/lib/post-lock-waiting";
import { planningTargetStarts } from "@/lib/open-weeks";
import { FAVORITES_LABEL, FAVORITE_REMOVED_TOAST, mealRecipeKey } from "@/lib/saved-meals";

export default function SavedMealsPage() {
  return (
    <AuthGate>
      <FavoritesBody />
    </AuthGate>
  );
}

function FavoritesBody() {
  const { snapshot, session, removeSavedMeal, setFavoriteTiming } = useSupper();
  const [toast, setToast] = useState<string | undefined>();

  if (!snapshot) {
    return (
      <AppShell title={FAVORITES_LABEL} backHref="/settings" backLabel="House">
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  const detailHrefByKey = new Map<string, string>();
  const weeks = [snapshot.meals, snapshot.planning?.meals ?? []];
  const recipePools = [snapshot.recipes, snapshot.planning?.recipes ?? []];
  weeks.forEach((meals, index) => {
    const recipes = recipePools[index] ?? [];
    for (const meal of meals) {
      const recipe = recipes.find((item) => item.mealId === meal.id);
      if (!dinnerRecipeReady(meal, recipes)) continue;
      const key = mealRecipeKey({ title: meal.title, recipeKey: recipe?.recipeKey });
      if (key && !detailHrefByKey.has(key)) detailHrefByKey.set(key, `/week/${meal.id}`);
    }
  });

  return (
    <AppShell title={FAVORITES_LABEL} backHref="/settings" backLabel="House">
      <FavoritesList
        meals={snapshot.savedMeals}
        timeZone={snapshot.household.timezone}
        planningStartsOn={planningTargetStarts(snapshot)}
        canAct={canActOnBallot(session?.role)}
        detailHrefByKey={detailHrefByKey}
        onTiming={async (recipeKey, timing) => {
          await setFavoriteTiming(recipeKey, timing);
        }}
        onRemove={async (recipeKey) => {
          await removeSavedMeal(recipeKey);
          setToast(FAVORITE_REMOVED_TOAST);
        }}
      />
      <BallotToast message={toast} onDismiss={() => setToast(undefined)} />
    </AppShell>
  );
}
