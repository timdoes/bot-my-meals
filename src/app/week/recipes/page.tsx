"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { RecipeBlock } from "@/components/recipe-view";
import { useSupper } from "@/components/supper-provider";
import { formatMealCardDayLabel, formatWeekEyebrow } from "@/lib/dates";
import { scopeForRole } from "@/lib/open-weeks";
import { isPendingBotFill } from "@/lib/post-lock-waiting";
import { ALL_RECIPES_TITLE, RECIPE_BACK_LABEL, steppableNights } from "@/lib/recipe-nav";
import { weekQuery } from "@/lib/week-navigator";

/** Full-week recipe inner page, reached from the quiet "All recipes" link under a locked week. */
export default function AllRecipesPage() {
  return (
    <AuthGate>
      <Suspense>
        <AllRecipesBody />
      </Suspense>
    </AuthGate>
  );
}

function AllRecipesBody() {
  const { snapshot } = useSupper();
  const searchParams = useSearchParams();
  const role = searchParams.get("week") === "next" && snapshot?.planning ? "planning" : "cooking";
  const query = weekQuery({ kind: role });
  const scope = snapshot ? scopeForRole(snapshot, role) : null;
  if (!snapshot || !scope || scope.week.status !== "locked") {
    return (
      <AppShell title={ALL_RECIPES_TITLE} backHref={`/week${query}`} backLabel={RECIPE_BACK_LABEL}>
        <p className="type-body text-muted-foreground">Recipes show up after the week locks.</p>
      </AppShell>
    );
  }
  const pending = isPendingBotFill({
    weekStatus: scope.week.status,
    meals: scope.meals,
    votes: scope.votes,
    memberships: snapshot.memberships,
    recipes: scope.recipes,
    shoppingList: scope.shoppingList,
  });
  const nights = steppableNights(scope.meals, scope.votes, snapshot.memberships);
  return (
    <AppShell
      title={ALL_RECIPES_TITLE}
      eyebrow={formatWeekEyebrow(scope.week.startsOn, true)}
      backHref={`/week${query}`}
      backLabel={RECIPE_BACK_LABEL}
    >
      {pending ? (
        <p className="type-body text-muted-foreground">Your Bot is still writing this week&apos;s recipes.</p>
      ) : (
        <div data-slot="all-recipes" className="space-y-8">
          {nights.map((meal) => (
            <section key={meal.id} data-slot="all-recipes-night" className="space-y-2">
              <Link href={`/week/${meal.id}${query}`} className="type-eyebrow block text-primary">
                {formatMealCardDayLabel(meal.nightDate)}
              </Link>
              <RecipeBlock
                recipe={scope.recipes.find((recipe) => recipe.mealId === meal.id)}
                servings={meal.servings}
                title={meal.title}
              />
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
