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
    <ul data-slot="never-again-list" className="overflow-hidden rounded-[14px] bg-card shadow-card">
      {visible.map((meal) => (
        <li
          key={meal.recipeKey}
          data-slot="never-again-row"
          className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0"
        >
          <p className="type-body font-semibold">{meal.title}</p>
          {canAct ? (
            <button
              type="button"
              data-slot="allow-again"
              onClick={() => {
                void onAllow(meal.recipeKey).catch(() => undefined);
              }}
              className="tap-target inline-flex min-h-11 shrink-0 items-center justify-center px-1 text-sm font-semibold text-primary"
            >
              {ALLOW_AGAIN_LABEL}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
