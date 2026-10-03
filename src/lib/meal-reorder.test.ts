import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BallotCard } from "@/components/ballot-card";
import { recipeNightsForWeek } from "./recipes";
import { applySampleWeek, emptyHousehold } from "./seed";
import {
  MOVE_EARLIER_LABEL,
  MOVE_LATER_LABEL,
  mealReorderAllowed,
  mealReorderAnnouncement,
  mealReorderControls,
  mealReorderDropAllowed,
  orderedMovableMealIds,
  reorderGripLabel,
  swapMealContent,
} from "./meal-reorder";
import type { HouseholdSnapshot, Meal, Vote } from "./types";

const srcRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(srcRoot, "..");

function house(): HouseholdSnapshot {
  return applySampleWeek(
    emptyHousehold("House", {
      id: "user-1",
      email: "a@example.com",
      displayName: "Ada",
    }),
  );
}

function night(meals: Meal[], dayIndex: number): Meal {
  const meal = meals.find((item) => item.dayIndex === dayIndex);
  if (!meal) throw new Error(`missing night ${dayIndex}`);
  return meal;
}

describe("swapMealContent", () => {
  it("trades title and recipe body and leaves each night's servings in place", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const source = meals[0];
    const target = meals.find((meal) => meal.servings !== source.servings) ?? meals[1];
    if (!source || !target) throw new Error("fixture needs two meals");
    const sourceRecipe = snapshot.recipes.find((recipe) => recipe.mealId === source.id);
    const targetRecipe = snapshot.recipes.find((recipe) => recipe.mealId === target.id);
    if (!sourceRecipe || !targetRecipe) throw new Error("fixture needs recipes");

    const next = swapMealContent(snapshot, source.id, target.id);
    const nextSource = next.meals.find((meal) => meal.id === source.id);
    const nextTarget = next.meals.find((meal) => meal.id === target.id);
    const nextSourceRecipe = next.recipes.find((recipe) => recipe.id === sourceRecipe.id);
    const nextTargetRecipe = next.recipes.find((recipe) => recipe.id === targetRecipe.id);

    expect(nextSource?.title).toBe(target.title);
    expect(nextTarget?.title).toBe(source.title);
    expect(nextSource?.pitch).toBe(target.pitch);
    expect(nextTarget?.pitch).toBe(source.pitch);
    expect(nextSource?.servings).toBe(source.servings);
    expect(nextTarget?.servings).toBe(target.servings);
    expect(nextSource?.audience).toBe(source.audience);
    expect(nextTarget?.audience).toBe(target.audience);
    expect(nextSource?.nightDate).toBe(source.nightDate);
    expect(nextTarget?.nightDate).toBe(target.nightDate);
    expect(nextSource?.dayIndex).toBe(source.dayIndex);
    expect(nextTarget?.dayIndex).toBe(target.dayIndex);
    expect(nextSourceRecipe?.steps).toEqual(targetRecipe.steps);
    expect(nextTargetRecipe?.steps).toEqual(sourceRecipe.steps);
    expect(nextSourceRecipe?.ingredients.map((item) => item.name)).toEqual(
      targetRecipe.ingredients.map((item) => item.name),
    );
    expect(nextSourceRecipe?.servings).toBe(sourceRecipe.servings);
    expect(nextTargetRecipe?.servings).toBe(targetRecipe.servings);
    expect(nextSourceRecipe?.mealId).toBe(source.id);
    expect(next.week.nightHeadcounts).toEqual(snapshot.week.nightHeadcounts);
    expect(next.household).toBe(snapshot.household);
    expect(next.household.nightHeadcounts).toEqual(snapshot.household.nightHeadcounts);
    expect(next.stores).toBe(snapshot.stores);
    expect(next.votes).toBe(snapshot.votes);
    expect(next.week).toBe(snapshot.week);
  });

  it("moves a saved recipe onto the other night without changing that night's servings", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const source = meals[0];
    const target = meals[1];
    if (!source || !target) throw new Error("fixture needs two meals");
    const sourceRecipe = snapshot.recipes.find((recipe) => recipe.mealId === source.id);
    if (!sourceRecipe) throw new Error("fixture needs a recipe");
    const stripped: HouseholdSnapshot = {
      ...snapshot,
      recipes: snapshot.recipes.filter((recipe) => recipe.mealId !== target.id),
    };

    const next = swapMealContent(stripped, source.id, target.id);
    const moved = next.recipes.find((recipe) => recipe.id === sourceRecipe.id);

    expect(moved?.mealId).toBe(target.id);
    expect(moved?.steps).toEqual(sourceRecipe.steps);
    expect(moved?.servings).toBe(target.servings);
    expect(next.meals.find((meal) => meal.id === source.id)?.servings).toBe(source.servings);
    expect(next.meals.find((meal) => meal.id === target.id)?.servings).toBe(target.servings);
    expect(next.meals.find((meal) => meal.id === target.id)?.title).toBe(source.title);
    expect(next.week.nightHeadcounts).toEqual(snapshot.week.nightHeadcounts);
    expect(next.household.nightHeadcounts).toEqual(snapshot.household.nightHeadcounts);
  });

  it("does not trade meals across weeks", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const source = meals[0];
    const target = meals[1];
    if (!source || !target) throw new Error("fixture needs two meals");
    const planningMeals = snapshot.meals.map((meal) => ({ ...meal, id: `plan-${meal.id}`, weekId: "plan-week" }));
    const withPlan: HouseholdSnapshot = {
      ...snapshot,
      planning: {
        week: { ...snapshot.week, id: "plan-week" },
        meals: planningMeals,
        votes: [],
        recipes: [],
        shoppingList: null,
        ballotRequest: null,
      },
    };

    expect(swapMealContent(withPlan, source.id, planningMeals[0]?.id ?? "")).toBe(withPlan);
    const next = swapMealContent(withPlan, planningMeals[0].id, planningMeals[1].id);
    expect(next.meals.find((meal) => meal.id === source.id)?.title).toBe(source.title);
    expect(next.meals.find((meal) => meal.id === source.id)?.servings).toBe(source.servings);
    expect(next.planning?.meals.find((meal) => meal.id === planningMeals[0].id)?.title).toBe(target.title);
    expect(next.planning?.meals.find((meal) => meal.id === planningMeals[0].id)?.servings).toBe(
      planningMeals[0].servings,
    );
    expect(next.planning?.week.nightHeadcounts).toEqual(snapshot.week.nightHeadcounts);
  });
});

describe("meal reorder availability", () => {
  it("hides a locked week and refuses past nights as source or target", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const earlier = night(meals, 0);
    const later = night(meals, 3);
    const todayIso = later.nightDate;
    const context = {
      viewingPast: false as const,
      weekStatus: "voting" as const,
      editableFrom: null,
      todayIso,
    };
    const movable = orderedMovableMealIds(snapshot.meals, snapshot.votes, snapshot.memberships, context);

    expect(movable).not.toContain(earlier.id);
    expect(movable[0]).toBe(later.id);
    expect(mealReorderDropAllowed(later.id, earlier.id, movable)).toBe(false);
    expect(mealReorderDropAllowed(earlier.id, later.id, movable)).toBe(false);
    expect(
      mealReorderAllowed({
        ...context,
        weekStatus: "locked",
        nightDate: later.nightDate,
        lifecycle: "passive",
        title: later.title,
      }),
    ).toBe(false);
    expect(
      orderedMovableMealIds(snapshot.meals, snapshot.votes, snapshot.memberships, {
        ...context,
        weekStatus: "locked",
        todayIso: earlier.nightDate,
      }),
    ).toEqual([]);
    expect(
      mealReorderControls({
        mealId: later.id,
        canAct: true,
        allowed: false,
        movableIds: movable,
      }),
    ).toBeNull();
    expect(
      orderedMovableMealIds(snapshot.meals, snapshot.votes, snapshot.memberships, {
        ...context,
        viewingPast: true,
        todayIso: earlier.nightDate,
      }),
    ).toEqual([]);
  });

  it("keeps past nights fixed after a mid-week unlock and disables the ends", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const today = night(meals, 2);
    const movable = orderedMovableMealIds(snapshot.meals, [], snapshot.memberships, {
      viewingPast: false,
      weekStatus: "voting",
      editableFrom: today.nightDate,
      todayIso: today.nightDate,
    });

    expect(movable).not.toContain(night(meals, 0).id);
    expect(movable).not.toContain(night(meals, 1).id);
    expect(movable[0]).toBe(today.id);
    expect(
      mealReorderControls({
        mealId: today.id,
        canAct: true,
        allowed: true,
        movableIds: movable,
      }),
    ).toEqual({ canMoveEarlier: false, canMoveLater: true });
    const last = movable.at(-1);
    if (!last) throw new Error("expected a later meal");
    expect(
      mealReorderControls({
        mealId: last,
        canAct: true,
        allowed: true,
        movableIds: movable,
      }),
    ).toEqual({ canMoveEarlier: true, canMoveLater: false });
    expect(
      mealReorderControls({
        mealId: today.id,
        canAct: true,
        allowed: true,
        movableIds: [today.id],
      }),
    ).toEqual({ canMoveEarlier: false, canMoveLater: false });
  });

  it("skips off nights and eaters", () => {
    const snapshot = house();
    const meals = recipeNightsForWeek(snapshot.meals);
    const removed = night(meals, 1);
    const member = snapshot.memberships[0];
    if (!member) throw new Error("fixture needs a member");
    const vote: Vote = {
      id: "vote-1",
      householdId: snapshot.household.id,
      mealId: removed.id,
      membershipId: member.id,
      choice: "remove",
      note: "",
      updatedAt: "2026-10-03T00:00:00.000Z",
    };
    const todayIso = night(meals, 0).nightDate;
    const movable = orderedMovableMealIds(snapshot.meals, [vote], snapshot.memberships, {
      viewingPast: false,
      weekStatus: "voting",
      editableFrom: null,
      todayIso,
    });

    expect(movable).not.toContain(removed.id);
    expect(mealReorderDropAllowed(night(meals, 0).id, removed.id, movable)).toBe(false);
    expect(
      mealReorderControls({
        mealId: night(meals, 0).id,
        canAct: false,
        allowed: true,
        movableIds: movable,
      }),
    ).toBeNull();
  });
});

describe("meal reorder copy and wiring", () => {
  it("announces the trade with weekdays and does not call it Swap", () => {
    expect(MOVE_EARLIER_LABEL).toBe("Move earlier");
    expect(MOVE_LATER_LABEL).toBe("Move later");
    expect(reorderGripLabel("Chili")).toBe("Reorder Chili");
    expect(
      mealReorderAnnouncement({
        mealTitle: "Chili",
        weekday: "Tuesday",
        otherMealTitle: "Tacos",
        otherWeekday: "Monday",
      }),
    ).toBe("Moved Chili to Tuesday. Tacos is now Monday.");
    expect(MOVE_EARLIER_LABEL).not.toMatch(/Swap/);
    expect(MOVE_LATER_LABEL).not.toMatch(/Swap/);
  });

  it("shows grip and chevrons on a movable card and hides them when reorder is omitted", () => {
    const snapshot = house();
    const meal = recipeNightsForWeek(snapshot.meals)[0];
    if (!meal) throw new Error("fixture needs a meal");
    const handlers = {
      mealId: meal.id,
      canMoveEarlier: false,
      canMoveLater: true,
      busy: false,
      onMoveEarlier: () => undefined,
      onMoveLater: () => undefined,
      onDrop: () => undefined,
    };
    const html = renderToStaticMarkup(
      createElement(BallotCard, {
        dayLabel: "Mon · Oct 5",
        title: meal.title,
        pitch: meal.pitch,
        servings: meal.servings,
        reorder: handlers,
        openHref: `/week/${meal.id}`,
        onSwap: () => undefined,
        onRemove: () => undefined,
      }),
    );
    expect(html).toContain('data-slot="meal-reorder-grip"');
    expect(html).toContain(`aria-label="${reorderGripLabel(meal.title)}"`);
    expect(html).toContain(`aria-label="${MOVE_EARLIER_LABEL}"`);
    expect(html).toContain(`aria-label="${MOVE_LATER_LABEL}"`);
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("min-w-[44px]");
    expect(html).toContain('data-reorderable="true"');
    expect(html).toContain(`data-reorder-id="${meal.id}"`);
    expect(html).toContain(`href="/week/${meal.id}"`);
    expect(html).toContain(">Swap<");
    expect(html).toContain(">Remove<");
    expect(html).toContain("select-none");
    const openAt = html.indexOf('data-slot="meal-card-open"');
    const sideAt = html.indexOf('data-slot="meal-reorder-side"');
    const actionsAt = html.indexOf('role="group"');
    expect(openAt).toBeGreaterThan(-1);
    expect(sideAt).toBeGreaterThan(openAt);
    expect(actionsAt).toBeGreaterThan(sideAt);
    const open = html.slice(openAt, html.indexOf("</a>", openAt));
    expect(open).not.toContain("meal-reorder-grip");
    expect(open).not.toContain(MOVE_EARLIER_LABEL);
    const side = html.slice(sideAt, actionsAt);
    expect(side).toContain("meal-reorder-grip");
    expect(side).toContain(MOVE_EARLIER_LABEL);
    expect(side).toContain(MOVE_LATER_LABEL);
    expect(side.indexOf("meal-reorder-grip")).toBeLessThan(side.indexOf(MOVE_EARLIER_LABEL));
    expect(side.indexOf(MOVE_EARLIER_LABEL)).toBeLessThan(side.indexOf(MOVE_LATER_LABEL));
    expect(html.match(/disabled=""/g)?.length).toBe(1);

    const hidden = renderToStaticMarkup(
      createElement(BallotCard, {
        dayLabel: "Mon · Oct 5",
        title: meal.title,
        servings: meal.servings,
      }),
    );
    expect(hidden).not.toContain("meal-reorder-grip");
    expect(hidden).not.toContain(MOVE_EARLIER_LABEL);
    expect(hidden).not.toContain(MOVE_LATER_LABEL);

    const busy = renderToStaticMarkup(
      createElement(BallotCard, {
        dayLabel: "Mon · Oct 5",
        title: meal.title,
        reorder: { ...handlers, canMoveEarlier: true, busy: true },
      }),
    );
    expect(busy.match(/disabled=""/g)?.length).toBe(3);
    expect(busy).not.toContain("animate-spin");
  });

  it("does not wake or notify the bot", () => {
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");
    const sql = readFileSync(
      path.join(repoRoot, "supabase/migrations/20261003163000_reorder_week_meals.sql"),
      "utf8",
    );
    const reorderStart = provider.indexOf("reorderMeals: (sourceMealId, targetMealId)");
    const reorder = provider.slice(reorderStart, provider.indexOf("toggleSavedMeal:", reorderStart));
    const move = week.slice(week.indexOf("const moveMeals"), week.indexOf("if (!snapshot) return null"));

    expect(reorder).toContain("swapMealContent");
    expect(reorder).toContain("supabaseReorderWeekMeals");
    expect(reorder).not.toContain("wakeWeekOrPlanChange");
    expect(reorder).not.toContain("requestBotWake");
    expect(reorder).not.toContain("needs_work");
    expect(reorder).not.toContain("check_now");
    expect(move).toContain("mealReorderAnnouncement");
    expect(move).toContain("reorderMeals");
    expect(move).not.toContain("requestBotWake");
    expect(move).not.toContain("wakeWeekOrPlanChange");
    expect(move).not.toContain("requestPendingRefresh");
    expect(sql).not.toContain("night_headcounts");
    expect(sql).not.toMatch(/update\s+public\.households/i);
    expect(sql).not.toMatch(/update\s+public\.household_stores/i);
    expect(sql).not.toMatch(/update\s+public\.weeks/i);
    expect(sql).not.toContain("bot_wake");
    expect(sql).not.toContain("pg_net");
    const mealsUpdate = sql.match(/update public\.meals[\s\S]*?where m\.id in \(source_meal, target_meal\);/)?.[0] ?? "";
    expect(mealsUpdate).toContain("title");
    expect(mealsUpdate).not.toMatch(/servings/);
    expect(sql).toContain("Only this week and next week can move meals.");
    expect(sql).toContain("That night is already past.");
    expect(sql).toContain("Unlock this week before moving meals.");
  });

  it("keeps reorder off the week strip, House, meal detail, and past weeks", () => {
    const card = readFileSync(path.join(srcRoot, "components/ballot-card.tsx"), "utf8");
    const strip = readFileSync(path.join(srcRoot, "components/week-strip.tsx"), "utf8");
    const navigator = readFileSync(path.join(srcRoot, "components/week-navigator.tsx"), "utf8");
    const detail = readFileSync(path.join(srcRoot, "app/week/[mealId]/page.tsx"), "utf8");
    const history = readFileSync(path.join(srcRoot, "components/past-weeks.tsx"), "utf8");
    const house = readFileSync(path.join(srcRoot, "app/settings/page.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");

    const css = readFileSync(path.join(srcRoot, "app/globals.css"), "utf8");
    expect(card).toContain('data-slot="meal-reorder-grip"');
    expect(card).toContain('data-slot="meal-reorder-side"');
    expect(card).toContain("onPointerDown={drag.onPointerDown}");
    expect(card).toContain("beginReorderHold");
    expect(card).toContain("endReorderHold");
    expect(card).toContain("onContextMenu");
    expect(card).not.toMatch(/Safari|iPhone|Android/);
    expect(css).toContain('[data-slot="meal-reorder-grip"]');
    expect(css).toContain('html[data-reorder-hold="true"]');
    expect(css).toContain("-webkit-touch-callout: none");
    expect(css).toContain("user-select: none");
    expect(css).not.toMatch(/Safari|iPhone|Android/);
    expect(strip).not.toContain("meal-reorder");
    expect(strip).not.toContain(MOVE_EARLIER_LABEL);
    expect(navigator).not.toContain("meal-reorder");
    expect(detail).not.toContain("meal-reorder");
    expect(detail).not.toContain(MOVE_EARLIER_LABEL);
    expect(history).not.toContain(MOVE_EARLIER_LABEL);
    expect(history).not.toContain("meal-reorder-grip");
    expect(house).not.toContain("meal-reorder");
    expect(week).toContain("mealReorderControls");
    expect(week).toContain('data-slot="meal-reorder-status"');
    expect(week).not.toMatch(/Safari|iPhone|Android/);
  });
});
