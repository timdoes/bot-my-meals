"use client";

import { ALLOW_AGAIN_LABEL, NEVER_AGAIN_EMPTY, neverAgainMeals } from "@/lib/meal-dislikes";
import type { MealDislike } from "@/lib/types";

export function NeverAgainList({
  rows,
  canAct,
  onAllow,
}: {
  rows: MealDislike[];
  canAct: boolean;
  onAllow: (recipeKey: string) => Promise<void>;
}) {
  const visible = neverAgainMeals(rows);
  if (visible.length === 0) {
    return (
      <p data-slot="never-again-empty" className="type-body text-muted-foreground">
        {NEVER_AGAIN_EMPTY}
      </p>
    );
  }

  return (
    <ul data-slot="never-again-list" className="space-y-3">
      {visible.map((meal) => (
        <li key={meal.recipeKey} data-slot="never-again-row" className="rounded-[14px] bg-card px-5 py-4 shadow-card">
          <p className="type-body font-semibold">{meal.title}</p>
          {canAct ? (
            <button
              type="button"
              data-slot="allow-again"
              onClick={() => {
                void onAllow(meal.recipeKey).catch(() => undefined);
              }}
              className="tap-target mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-border bg-card px-3 text-sm font-semibold"
            >
              {ALLOW_AGAIN_LABEL}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
