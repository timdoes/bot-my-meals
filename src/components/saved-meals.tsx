"use client";

import Link from "next/link";
import {
  FAVORITE_ACTION_LATER,
  FAVORITE_ACTION_NEXT,
  FAVORITES_EMPTY_BACK,
  FAVORITES_EMPTY_BODY,
  FAVORITES_EMPTY_TITLE,
  FAVORITES_HELPER,
  REMOVE_FAVORITE_LABEL,
  favoriteTimingFor,
  favoriteTimingLabel,
  savedMealWhenLine,
  sortSavedMeals,
  type FavoriteTiming,
} from "@/lib/saved-meals";
import type { SavedMeal } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FavoritesList({
  meals,
  timeZone,
  planningStartsOn,
  canAct,
  detailHrefByKey,
  onTiming,
  onRemove,
}: {
  meals: SavedMeal[];
  timeZone: string;
  planningStartsOn: string;
  canAct: boolean;
  detailHrefByKey: ReadonlyMap<string, string>;
  onTiming: (recipeKey: string, timing: FavoriteTiming) => Promise<void>;
  onRemove: (recipeKey: string) => Promise<void>;
}) {
  const visible = sortSavedMeals(meals);
  if (visible.length === 0) {
    return (
      <div data-slot="favorites-empty" className="rounded-[14px] bg-card p-5 shadow-card">
        <h2 className="type-section">{FAVORITES_EMPTY_TITLE}</h2>
        <p className="type-body mt-2 text-muted-foreground">{FAVORITES_EMPTY_BODY}</p>
        <Link
          href="/week"
          className="tap-target mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          {FAVORITES_EMPTY_BACK}
        </Link>
      </div>
    );
  }

  return (
    <div data-slot="favorites-list">
      <p data-slot="favorites-helper" className="type-meta text-muted-foreground">
        {FAVORITES_HELPER}
      </p>
      <ul className="mt-4 space-y-3">
        {visible.map((meal) => (
          <FavoriteRow
            key={meal.recipeKey}
            meal={meal}
            timeZone={timeZone}
            planningStartsOn={planningStartsOn}
            canAct={canAct}
            detailHref={detailHrefByKey.get(meal.recipeKey)}
            onTiming={onTiming}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </div>
  );
}

function FavoriteRow({
  meal,
  timeZone,
  planningStartsOn,
  canAct,
  detailHref,
  onTiming,
  onRemove,
}: {
  meal: SavedMeal;
  timeZone: string;
  planningStartsOn: string;
  canAct: boolean;
  detailHref?: string;
  onTiming: (recipeKey: string, timing: FavoriteTiming) => Promise<void>;
  onRemove: (recipeKey: string) => Promise<void>;
}) {
  const timing = favoriteTimingFor(meal, planningStartsOn);
  const title = detailHref ? (
    <Link href={detailHref} className="type-body font-semibold">
      {meal.title}
    </Link>
  ) : (
    <p className="type-body font-semibold">{meal.title}</p>
  );

  return (
    <li data-slot="favorite-row" className="rounded-[14px] bg-card px-5 py-4 shadow-card">
      {title}
      <p data-slot="favorite-timing" className="type-meta mt-1 text-muted-foreground">
        {favoriteTimingLabel(meal, planningStartsOn)}
      </p>
      {meal.lastLockedAt ? (
        <p data-slot="favorite-last-cooked" className="type-meta mt-1 text-muted-foreground">
          {savedMealWhenLine(meal, timeZone)}
        </p>
      ) : null}
      {canAct ? (
        <div className="mt-3 space-y-2">
          <div role="radiogroup" aria-label={`When to suggest ${meal.title}`} className="grid grid-cols-2 gap-2">
            <TimingButton
              label={FAVORITE_ACTION_NEXT}
              selected={timing === "next"}
              onSelect={() => onTiming(meal.recipeKey, "next")}
            />
            <TimingButton
              label={FAVORITE_ACTION_LATER}
              selected={timing === "cooldown"}
              onSelect={() => onTiming(meal.recipeKey, "cooldown")}
            />
          </div>
          <button
            type="button"
            data-slot="favorite-remove"
            onClick={() => {
              void onRemove(meal.recipeKey).catch(() => undefined);
            }}
            className="tap-target inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-border bg-card px-3 text-sm font-semibold"
          >
            {REMOVE_FAVORITE_LABEL}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function TimingButton({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-slot="favorite-timing-edit"
      onClick={() => {
        void onSelect();
      }}
      className={cn(
        "tap-target inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border px-2 text-sm font-semibold",
        selected ? "border-transparent bg-secondary text-foreground" : "border-border bg-card text-foreground",
      )}
    >
      {label}
    </button>
  );
}
