"use client";

import { useOptionalSupper } from "@/components/use-food-rule-heads-up";
import { Button } from "@/components/ui/button";
import {
  FOOD_HOLD_ACK,
  FOOD_HOLD_ASK,
  foodRuleChipLabel,
  foodRuleSwapNote,
  nightHasSafetyRules,
  recipeHoldView,
  recipeSoftHits,
} from "@/lib/food-rule-check";
import { FOOD_RULES_SAFETY } from "@/lib/food-rules";
import { canActOnBallot } from "@/lib/lock";
import { formatQuantity } from "@/lib/shopping";
import type { Recipe } from "@/lib/types";

export function RecipeBlock({
  recipe,
  servings,
  title,
}: {
  recipe?: Recipe;
  servings: number;
  title?: string;
}) {
  const supper = useOptionalSupper();
  const snapshot = supper?.snapshot ?? null;
  const canAct = canActOnBallot(supper?.session?.role);
  const hold = recipe && snapshot ? recipeHoldView(snapshot, recipe) : null;
  const soft = recipe && snapshot && !hold ? recipeSoftHits(snapshot, recipe) : { intolerances: [], dislikes: [] };
  const meal = recipe && snapshot
    ? snapshot.meals.find((item) => item.id === recipe.mealId)
      ?? snapshot.planning?.meals.find((item) => item.id === recipe.mealId)
    : undefined;
  const safetyFooter =
    recipe && snapshot && meal && !hold && nightHasSafetyRules(snapshot, meal.weekId, meal.dayIndex);

  if (!recipe) {
    return (
      <div
        data-slot="recipe-block"
        data-empty="true"
        className="rounded-[14px] border border-dashed border-border bg-card p-5 shadow-card"
      >
        <h2 className="type-section">{title ?? "Recipe"}</h2>
        <p className="type-body mt-2 text-muted-foreground">
          No recipe was saved for this night. The shopping list only includes nights with ingredients.
        </p>
      </div>
    );
  }

  const minutes = recipe.prepMinutes + recipe.cookMinutes;

  if (hold) {
    return (
      <div data-slot="recipe-block" data-held="true" className="space-y-4">
        {title ? <h2 className="type-section">{title}</h2> : null}
        <div
          data-slot="food-rule-hold"
          className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-4"
        >
          <h3 className="type-section text-destructive">{hold.banner}</h3>
          <p className="type-body mt-2 text-destructive">{hold.body}</p>
          {canAct ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="fat"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (!meal) return;
                  void supper?.setVote(meal.id, "swap", foodRuleSwapNote(hold.food)).catch(() => undefined);
                }}
              >
                {FOOD_HOLD_ASK}
              </Button>
              {hold.holdIds.length > 0 ? (
                <Button
                  type="button"
                  size="fat"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    void Promise.all(hold.holdIds.map((id) => supper?.ackFoodHold(id) ?? Promise.resolve())).catch(
                      () => undefined,
                    );
                  }}
                >
                  {FOOD_HOLD_ACK}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div data-slot="recipe-block" className="space-y-6">
      {title ? <h2 className="type-section">{title}</h2> : null}
      <div className="flex flex-wrap gap-2">
        <span className="type-chip inline-flex rounded-[var(--radius-chip)] bg-secondary px-2.5 py-1 text-foreground">
          <span className="font-mono">{minutes}</span>
          <span className="ml-1">min</span>
        </span>
        <span
          data-slot="recipe-servings"
          className="type-chip inline-flex rounded-[var(--radius-chip)] bg-secondary px-2.5 py-1 text-foreground"
        >
          {servings > 0 ? (
            <>
              <span className="font-mono">{servings}</span>
              <span className="ml-1">{servings === 1 ? "serving" : "servings"}</span>
            </>
          ) : (
            "No dinner"
          )}
        </span>
        {soft.intolerances.map((hit) => (
          <span
            key={hit.ruleId}
            data-slot="food-rule-chip"
            data-severity="intolerance"
            className="type-chip inline-flex rounded-full border border-[color:var(--swap)]/40 px-2.5 py-1 text-swap"
          >
            {foodRuleChipLabel(hit)}
          </span>
        ))}
      </div>
      <div>
        <h3 className="type-eyebrow text-muted-foreground">Ingredients</h3>
        <ul className="mt-2 divide-y divide-border rounded-[14px] bg-card shadow-card">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="flex min-h-12 items-center justify-between gap-3 px-4">
              <span className="type-body">{ingredient.name}</span>
              <span className="type-meta font-mono text-muted-foreground">
                {formatQuantity(ingredient.quantity, ingredient.unit)}
              </span>
            </li>
          ))}
        </ul>
        {soft.dislikes.map((hit) => (
          <p key={hit.ruleId} data-slot="food-rule-has" className="type-meta mt-2 text-muted-foreground">
            {foodRuleChipLabel(hit)}
          </p>
        ))}
        {safetyFooter ? (
          <p data-slot="food-rule-safety" className="type-meta mt-2 text-muted-foreground">
            {FOOD_RULES_SAFETY}
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="type-eyebrow text-muted-foreground">Steps</h3>
        <ol className="mt-3 space-y-3">
          {recipe.steps.map((step, index) => (
            <li key={`${index}-${step}`} className="flex gap-3">
              <span className="type-chip mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-foreground">
                {index + 1}
              </span>
              <p className="type-body leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export const RecipeView = RecipeBlock;
