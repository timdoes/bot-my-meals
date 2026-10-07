import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DislikeMealForm } from "@/components/dislike-meal";
import { FavoriteMealForm } from "@/components/favorite-meal";
import { NeverAgainList } from "@/components/never-again-list";
import { emptyHousehold } from "@/lib/seed";
import {
  DISLIKE_NOTE_LABEL,
  NEVER_AGAIN_EMPTY,
  NEVER_AGAIN_LABEL,
  dislikeSendAction,
  neverAgainMeals,
} from "@/lib/meal-dislikes";
import { applyDislikeAction, applyFavoriteAction } from "@/lib/meal-reactions";
import {
  FAVORITE_IN_THREE_WEEKS,
  FAVORITE_NEXT_TOAST,
  FAVORITE_NEXT_WEEK,
  FAVORITE_SAVED_TOAST,
  favoriteNextWeekStarts,
  favoriteSendAction,
  mealReactionVisible,
  mealSaveAvailability,
} from "@/lib/saved-meals";
import type { MealDislike, Membership, Recipe, SavedMeal, Vote } from "@/lib/types";

const srcRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(import.meta.dirname, "../..");

function saved(partial: Partial<SavedMeal> & Pick<SavedMeal, "recipeKey" | "title">): SavedMeal {
  return {
    id: partial.recipeKey,
    householdId: "house",
    savedAt: "2026-09-01T00:00:00.000Z",
    lastLockedAt: null,
    requestedForWeek: null,
    sourceRecipeId: null,
    ...partial,
  };
}

function dislike(partial: Partial<MealDislike> & Pick<MealDislike, "recipeKey" | "title">): MealDislike {
  return {
    id: partial.recipeKey,
    householdId: "house",
    neverAgain: false,
    note: "",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("favorite send", () => {
  it("enables Send for a favorite, a like note, or removing one, and disables an empty off switch", () => {
    expect(favoriteSendAction({ favorite: true, timing: "cooldown", note: "" }, false)).toBe("cooldown");
    expect(favoriteSendAction({ favorite: true, timing: "next", note: "crispy" }, false)).toBe("next");
    expect(favoriteSendAction({ favorite: true, timing: "next", note: "" }, true)).toBe("next");
    expect(favoriteSendAction({ favorite: false, timing: "cooldown", note: "the sauce" }, false)).toBe("like");
    expect(favoriteSendAction({ favorite: false, timing: "cooldown", note: "" }, true)).toBe("remove");
    expect(favoriteSendAction({ favorite: false, timing: "next", note: "  " }, false)).toBeNull();
  });

  it("aims Make next week at the planning week and never the cooking week", () => {
    expect(favoriteNextWeekStarts("2026-10-04", null)).toBe("2026-10-11");
    expect(favoriteNextWeekStarts("2026-10-04", "2026-10-11")).toBe("2026-10-11");
    expect(favoriteNextWeekStarts("2026-10-04", "2026-10-04")).toBe("2026-10-11");
    expect(favoriteNextWeekStarts("2026-10-04", "2026-10-18")).toBe("2026-10-11");
  });

  it("stores a favorite, drops it for a like-only note, and clears Never again when the switch is on", () => {
    const base = emptyHousehold("House");
    const favorite = saved({ recipeKey: "chili", title: "Chili", requestedForWeek: "2026-10-11" });
    const blocked = dislike({ recipeKey: "chili", title: "Chili", neverAgain: true, note: "too spicy" });
    const withBlock = { ...base, mealDislikes: [blocked], savedMeals: [] };

    const next = applyFavoriteAction(withBlock, "next", favorite);
    expect(next.savedMeals).toEqual([favorite]);
    expect(next.mealDislikes).toEqual([{ ...blocked, neverAgain: false }]);
    expect(next.meals).toBe(base.meals);
    expect(next.shoppingList).toBe(base.shoppingList);
    expect(next.votes).toBe(base.votes);

    const liked = applyFavoriteAction(next, "like", favorite);
    expect(liked.savedMeals).toEqual([]);
    expect(liked.mealDislikes[0]?.neverAgain).toBe(false);
    expect(liked.mealDislikes[0]?.note).toBe("too spicy");

    const cleared = applyFavoriteAction(
      { ...base, mealDislikes: [{ ...blocked, note: "" }], savedMeals: [] },
      "cooldown",
      saved({ recipeKey: "chili", title: "Chili" }),
    );
    expect(cleared.mealDislikes).toEqual([]);
    expect(cleared.savedMeals).toHaveLength(1);
    expect(cleared.savedMeals[0]?.requestedForWeek).toBeNull();
  });
});

describe("dislike send", () => {
  it("enables Never again, a filled note, and allow-again, and disables an empty off switch", () => {
    expect(dislikeSendAction({ neverAgain: true, note: "" }, false)).toBe("block");
    expect(dislikeSendAction({ neverAgain: true, note: "the beans" }, false)).toBe("block");
    expect(dislikeSendAction({ neverAgain: false, note: "the beans" }, false)).toBe("feedback");
    expect(dislikeSendAction({ neverAgain: false, note: "" }, false)).toBeNull();
    expect(dislikeSendAction({ neverAgain: false, note: "  " }, true)).toBe("allow");
  });

  it("blocks the meal, drops a favorite, and leaves the night and shopping list alone", () => {
    const base = emptyHousehold("House");
    const favorite = saved({ recipeKey: "chili", title: "Chili", requestedForWeek: "2026-10-11" });
    const start = { ...base, savedMeals: [favorite] };
    const blocked = applyDislikeAction(
      start,
      "block",
      dislike({ recipeKey: "chili", title: "Chili", neverAgain: true, note: "" }),
    );
    expect(blocked.savedMeals).toEqual([]);
    expect(blocked.mealDislikes[0]?.neverAgain).toBe(true);
    expect(blocked.meals).toBe(base.meals);
    expect(blocked.shoppingList).toBe(base.shoppingList);
    expect(neverAgainMeals(blocked.mealDislikes).map((row) => row.title)).toEqual(["Chili"]);

    const noted = applyDislikeAction(
      blocked,
      "feedback",
      dislike({ recipeKey: "tacos", title: "Tacos", neverAgain: false, note: "onions" }),
    );
    expect(noted.savedMeals).toEqual([]);
    expect(neverAgainMeals(noted.mealDislikes).map((row) => row.recipeKey)).toEqual(["chili"]);
    expect(noted.mealDislikes.find((row) => row.recipeKey === "tacos")?.neverAgain).toBe(false);

    const allowed = applyDislikeAction(noted, "allow", dislike({ recipeKey: "chili", title: "Chili", note: "beans" }));
    expect(neverAgainMeals(allowed.mealDislikes)).toEqual([]);
    expect(allowed.mealDislikes.find((row) => row.recipeKey === "chili")?.note).toBe("beans");
    expect(allowed.mealDislikes.find((row) => row.recipeKey === "chili")?.neverAgain).toBe(false);
  });

  it("hides both thumbs unless the night has a recipe identity", () => {
    const voters: Membership[] = [
      {
        id: "mem",
        householdId: "h",
        userId: "u",
        role: "voter",
        displayName: "Sam",
        email: "s@example.com",
      },
    ];
    const vote = (choice: Vote["choice"]): Vote => ({
      id: "v",
      householdId: "h",
      mealId: "m",
      membershipId: "mem",
      choice,
      note: "",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const ready: Recipe = {
      id: "r",
      mealId: "m",
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      steps: ["Simmer."],
      ingredients: [],
    };
    const night = { id: "m", title: "Chili" };
    expect(
      mealReactionVisible(
        mealSaveAvailability({ meal: night, votes: [], memberships: voters, recipes: [ready] }),
      ),
    ).toBe(true);
    expect(
      mealReactionVisible(mealSaveAvailability({ meal: night, votes: [], memberships: voters, recipes: [] })),
    ).toBe(false);
    expect(
      mealReactionVisible(
        mealSaveAvailability({ meal: { id: "m", title: "" }, votes: [], memberships: voters, recipes: [ready] }),
      ),
    ).toBe(false);
    expect(
      mealReactionVisible(
        mealSaveAvailability({
          meal: night,
          votes: [vote("remove")],
          memberships: voters,
          recipes: [ready],
        }),
      ),
    ).toBe(false);
  });
});

describe("reaction modals", () => {
  it("shows favorite timing only while the switch is on, with exactly one choice", () => {
    const on = renderToStaticMarkup(
      createElement(FavoriteMealForm, {
        favorite: true,
        timing: "cooldown",
        note: "",
        wasFavorite: false,
        onFavorite: () => undefined,
        onTiming: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(on).toContain("Add to favorites");
    expect(on).toContain(FAVORITE_NEXT_WEEK);
    expect(on).toContain(FAVORITE_IN_THREE_WEEKS);
    expect(on).toContain("What did you like about this meal?");
    expect(on).toContain("Send");
    expect(on).toContain("Cancel");
    expect(on.match(/role="radio" aria-checked="true"/g)).toHaveLength(1);
    expect(on.match(/role="radio" aria-checked="false"/g)).toHaveLength(1);
    expect(on).toContain('data-timing="cooldown"');
    expect(on).not.toContain('disabled=""');

    const off = renderToStaticMarkup(
      createElement(FavoriteMealForm, {
        favorite: false,
        timing: "cooldown",
        note: "",
        wasFavorite: false,
        onFavorite: () => undefined,
        onTiming: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(off).not.toContain(FAVORITE_NEXT_WEEK);
    expect(off).not.toContain(FAVORITE_IN_THREE_WEEKS);
    expect(off).toContain('disabled=""');

    const removing = renderToStaticMarkup(
      createElement(FavoriteMealForm, {
        favorite: false,
        timing: "next",
        note: "",
        wasFavorite: true,
        onFavorite: () => undefined,
        onTiming: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(removing).not.toContain('disabled=""');
  });

  it("disables dislike Send only when Never again is off and the note is empty on a suggestable meal", () => {
    const empty = renderToStaticMarkup(
      createElement(DislikeMealForm, {
        neverAgain: false,
        note: "",
        currentlyBlocked: false,
        onNeverAgain: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(empty).toContain(NEVER_AGAIN_LABEL);
    expect(empty).toContain(DISLIKE_NOTE_LABEL);
    expect(empty).toContain("Optional");
    expect(empty).toContain('disabled=""');

    const noted = renderToStaticMarkup(
      createElement(DislikeMealForm, {
        neverAgain: false,
        note: "mushrooms",
        currentlyBlocked: false,
        onNeverAgain: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(noted).not.toContain('disabled=""');

    const blocked = renderToStaticMarkup(
      createElement(DislikeMealForm, {
        neverAgain: true,
        note: "",
        currentlyBlocked: true,
        onNeverAgain: () => undefined,
        onNote: () => undefined,
        onSend: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(blocked).not.toContain('disabled=""');
    expect(blocked).toContain('aria-checked="true"');
  });

  it("lists only whole-meal blocks and offers Allow again", () => {
    const empty = renderToStaticMarkup(
      createElement(NeverAgainList, { rows: [], canAct: true, onAllow: async () => undefined }),
    );
    expect(empty).toContain(NEVER_AGAIN_EMPTY);

    const list = renderToStaticMarkup(
      createElement(NeverAgainList, {
        rows: [
          dislike({ recipeKey: "chili", title: "Chili", neverAgain: true }),
          dislike({ recipeKey: "tacos", title: "Tacos", neverAgain: false, note: "onions" }),
        ],
        canAct: true,
        onAllow: async () => undefined,
      }),
    );
    expect(list).toContain("Chili");
    expect(list).not.toContain("Tacos");
    expect(list).toContain("Allow again");
    expect(list).toContain('data-slot="allow-again"');
  });
});

describe("reaction wiring", () => {
  it("does not wake the bot or rebuild shopping from either Send", () => {
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");
    const detail = readFileSync(path.join(srcRoot, "app/week/[mealId]/page.tsx"), "utf8");
    const favorites = readFileSync(path.join(srcRoot, "app/settings/saved/page.tsx"), "utf8");
    const sql = readFileSync(
      path.join(repoRoot, "supabase/migrations/20261007020000_meal_reactions.sql"),
      "utf8",
    );
    const start = provider.indexOf("sendMealFavorite: (mealId, draft)");
    const block = provider.slice(start, provider.indexOf("// refresh/run close", start));

    expect(block).toContain("supabaseUpsertFavorite");
    expect(block).toContain("supabaseInsertMealLike");
    expect(block).toContain("supabaseUpsertMealDislike");
    expect(block).toContain("supabaseSetFavoriteTiming");
    expect(block).toContain("supabaseAllowMealAgain");
    expect(block).toContain("favoriteNextWeekStarts");
    expect(block).not.toContain("wakeWeekOrPlanChange");
    expect(block).not.toContain("requestBotWake");
    expect(block).not.toContain("request_saved_for_planning");
    expect(block).not.toContain("planNextWeek");
    expect(block).not.toContain("shopping");
    expect(detail).toContain("DislikeMealControl");
    expect(detail).toContain("FavoriteMealControl");
    expect(detail).not.toContain("SaveMealControl");
    expect(favorites).not.toContain("wakeWeekOrPlanChange");
    expect(favorites).not.toContain("requestSavedMeal");

    expect(sql).toContain("create table if not exists public.meal_dislikes");
    expect(sql).toContain("create table if not exists public.meal_likes");
    expect(sql).toContain("meal_dislikes_member_read");
    expect(sql).toContain("meal_dislikes_voter_write");
    expect(sql).toContain("meal_likes_voter_insert");
    expect(sql).toContain("m.role in ('owner', 'voter')");
    expect(sql).toContain("unique (household_id, recipe_key)");
    expect(sql).toContain("delete from public.saved_meals");
    expect(sql).toContain("public.meal_avoidance()");
    expect(sql).not.toContain("pg_net");
    expect(sql).not.toContain("bot_wake");
    expect(sql).not.toMatch(/grandma/i);

    const thumbs = readFileSync(path.join(srcRoot, "components/favorite-meal.tsx"), "utf8");
    const down = readFileSync(path.join(srcRoot, "components/dislike-meal.tsx"), "utf8");
    expect(thumbs).toContain("min-h-11");
    expect(thumbs).toContain("min-w-11");
    expect(down).toContain("min-h-11");
    expect(down).toContain("min-w-11");
    expect(detail).toContain("gap-2");
    expect(FAVORITE_NEXT_TOAST).toBe("Added for next week.");
    expect(FAVORITE_SAVED_TOAST).toBe("Added to favorites.");
  });
});
