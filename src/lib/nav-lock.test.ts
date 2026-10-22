import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotWakeSettings } from "@/components/bot-wake-settings";
import { WeekStrip } from "@/components/week-strip";
import { addDays } from "./dates";
import { favoritesRowLine, pastWeeksRowLine, WAKE_READ_ONLY_NOTE } from "./house-settings";
import {
  LIST_COPIED_TOAST,
  filterShareGroups,
  listBannerLine,
  printSubline,
  shoppingListShareText,
  type ShareGroup,
} from "./list-share";
import { NAV_REDIRECTS } from "./nav-redirects";
import { NAV_TABS, navTabActive, navTabHref } from "./nav-tabs";
import { adjacentNights, recipeEyebrow, recipeNextLine, steppableNights } from "./recipe-nav";
import type { Meal, Vote } from "./types";
import { navigatorHref, weekQuery } from "./week-navigator";
import {
  WEEK_AWAY_RESET_MS,
  awayLongEnoughToReset,
  parseWeekSession,
  selectionFromSearch,
  serializeWeekSession,
} from "./week-session";

const srcRoot = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(srcRoot, rel), "utf8");

describe("bottom nav: Meals · List · House · Settings", () => {
  it("has exactly four tabs with the locked labels and routes, no Recipes and no /meals", () => {
    expect(NAV_TABS.map((tab) => [tab.label, tab.href])).toEqual([
      ["Meals", "/week"],
      ["List", "/list"],
      ["House", "/house"],
      ["Settings", "/settings"],
    ]);
    const shell = read("components/app-shell.tsx");
    expect(shell).toContain("Utensils");
    expect(shell).toContain("ClipboardList");
    expect(shell).toContain("House,");
    expect(shell).toContain("Settings,");
    expect(shell).not.toContain("BookOpen");
    expect(shell).not.toContain("Settings2");
    expect(shell).toContain("resetViewedWeek");
    expect(existsSync(path.join(srcRoot, "app/recipes"))).toBe(false);
    expect(existsSync(path.join(srcRoot, "app/meals"))).toBe(false);
  });

  it("keeps House and Settings active states apart", () => {
    expect(navTabActive("/house/food-rules", "/house")).toBe(true);
    expect(navTabActive("/house", "/settings")).toBe(false);
    expect(navTabActive("/settings", "/settings")).toBe(true);
    expect(navTabActive("/week/abc", "/week")).toBe(true);
  });

  it("carries the shared week on Meals and List links only", () => {
    expect(navTabHref("/week", { kind: "planning" })).toBe("/week?week=next");
    expect(navTabHref("/list", { kind: "past", startsOn: "2026-10-04" })).toBe("/list?past=2026-10-04");
    expect(navTabHref("/list", { kind: "cooking" })).toBe("/list");
    expect(navTabHref("/house", { kind: "planning" })).toBe("/house");
    expect(navigatorHref({ kind: "planning" }, "/list")).toBe("/list?week=next");
    expect(weekQuery({ kind: "cooking" })).toBe("");
  });
});

describe("redirects", () => {
  it("sends /recipes to /week and old House subpages under /house", () => {
    const map = Object.fromEntries(NAV_REDIRECTS.map((r) => [r.source, r.destination]));
    expect(map["/recipes"]).toBe("/week");
    expect(map["/settings/saved"]).toBe("/house/favorites");
    expect(map["/settings/food-rules"]).toBe("/house/food-rules");
    expect(map["/settings/never-again"]).toBe("/house/food-rules#meals");
    expect(map["/settings/history"]).toBe("/house/past-weeks");
    expect(map["/settings/history/:startsOn"]).toBe("/house/past-weeks/:startsOn");
    expect(map["/settings"]).toBeUndefined();
    expect(map["/meals"]).toBeUndefined();
    expect(NAV_REDIRECTS.every((r) => r.permanent === false)).toBe(true);
    expect(readFileSync(path.join(srcRoot, "../next.config.ts"), "utf8")).toContain("NAV_REDIRECTS");
  });
});

describe("shared week session", () => {
  it("restores within four hours and drops stale or bad values", () => {
    const now = 1_000_000_000;
    const raw = serializeWeekSession({ kind: "planning" }, now);
    expect(parseWeekSession(raw, now + 1000)).toEqual({ kind: "planning" });
    expect(parseWeekSession(raw, now + WEEK_AWAY_RESET_MS + 1)).toBeNull();
    expect(parseWeekSession("{nope", now)).toBeNull();
    expect(parseWeekSession(JSON.stringify({ selection: { kind: "past", startsOn: "x" }, at: now }), now)).toBeNull();
    expect(awayLongEnoughToReset(now, now + WEEK_AWAY_RESET_MS)).toBe(true);
    expect(awayLongEnoughToReset(now, now + 60_000)).toBe(false);
    expect(awayLongEnoughToReset(null, now)).toBe(false);
  });

  it("reads ?week= / ?past= and ignores stale ones", () => {
    const params = (q: string) => new URLSearchParams(q);
    const known = { pastStartsOn: ["2026-10-04"], hasPlanning: true };
    expect(selectionFromSearch(params("past=2026-10-04"), known)).toEqual({ kind: "past", startsOn: "2026-10-04" });
    expect(selectionFromSearch(params("past=1999-01-03"), known)).toBeNull();
    expect(selectionFromSearch(params("week=next"), known)).toEqual({ kind: "planning" });
    expect(selectionFromSearch(params("week=next"), { ...known, hasPlanning: false })).toBeNull();
    expect(selectionFromSearch(params(""), known)).toBeNull();
  });

  it("puts the same strip on Meals and List; only Meals creates a planning week", () => {
    const list = read("app/list/page.tsx");
    const strip = read("components/list-week-strip.tsx");
    expect(list).toContain("<ListWeekStrip />");
    expect(list).toContain('useWeekUrlSync("/list")');
    expect(list).toContain("useForegroundWeekRefresh");
    expect(list).not.toContain("backHref");
    expect(read("app/week/page.tsx")).toContain('useWeekUrlSync("/week")');
    expect(strip).toContain("WeekNavigator");
    expect(strip).toContain("interactive={false}");
    expect(strip).not.toContain("planNextWeek");
    expect(strip).not.toContain("futureSwipeCreatesPlanning");
  });

  it("renders List strip cells as non-buttons with one filled selected style and a today dot", () => {
    const startsOn = "2026-10-11";
    const nights = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, nightDate: addDays(startsOn, i), hasMeal: true }));
    const html = renderToStaticMarkup(
      createElement(WeekStrip, {
        startsOn,
        nights,
        selectedMealId: "m0",
        todayIso: startsOn,
        interactive: false,
        onSelect: () => undefined,
      }),
    );
    expect(html).not.toContain("<button");
    expect(html).toContain('data-slot="week-strip-today-dot"');
    expect(html).toContain("bg-primary text-primary-foreground");
    expect(html).not.toContain("bg-primary/15");
  });
});

function meal(id: string, day: number, title = `Dinner ${id}`): Meal {
  return {
    id,
    weekId: "w",
    dayIndex: day,
    nightDate: addDays("2026-10-11", day),
    title,
    pitch: "",
    servings: 4,
    prepMinutes: 30,
    isLeftovers: false,
  } as Meal;
}

describe("recipe page prev/next nights", () => {
  const meals = [meal("sun", 0), meal("mon", 1, "Black bean tacos"), meal("tue", 2), meal("wed", 3)];
  const votes = [{ mealId: "tue", membershipId: "a", choice: "remove", createdAt: "2026-10-10T00:00:00Z" } as unknown as Vote];

  it("skips nights off and stops at the week's ends", () => {
    expect(steppableNights(meals, votes).map((m) => m.id)).toEqual(["sun", "mon", "wed"]);
    expect(adjacentNights(meals, votes, "sun")).toEqual({ previous: null, next: meals[1] });
    expect(adjacentNights(meals, votes, "mon").next?.id).toBe("wed");
    expect(adjacentNights(meals, votes, "wed").next).toBeNull();
    expect(adjacentNights(meals, votes, "tue").previous?.id).toBe("mon");
  });

  it("skips nights the lock never covered", () => {
    const week = { status: "locked" as const, plannedFrom: "2026-10-13", editableFrom: null };
    expect(steppableNights(meals, votes, undefined, week).map((item) => item.id)).toEqual(["wed"]);
  });

  it("uses the locked eyebrow and Next line strings", () => {
    expect(recipeEyebrow("2026-10-11", "2026-10-11")).toBe("Tonight · Sun Oct 11");
    expect(recipeEyebrow("2026-10-12", "2026-10-11")).toBe("Mon · Oct 12");
    expect(recipeNextLine(meals[1])).toBe("Next: Mon · Black bean tacos");
    expect(recipeNextLine(null)).toBeNull();
    const page = read("app/week/[mealId]/page.tsx");
    expect(page).toContain("PREVIOUS_NIGHT_LABEL");
    expect(page).toContain("NEXT_NIGHT_LABEL");
    expect(page).toContain("size-12");
    expect(page).not.toMatch(/Shopping list/);
  });

  it("opens the recipe from the card and offers All recipes under a locked week", () => {
    const week = read("app/week/page.tsx");
    expect(week).toContain('data-slot="all-recipes-link"');
    expect(week).toContain("ALL_RECIPES_LABEL");
    expect(week).toContain("opensRecipe=");
    expect(read("components/ballot-card.tsx")).toContain('data-slot="meal-card-chevron"');
    expect(week).not.toMatch(/Open recipe/);
  });
});

describe("List share", () => {
  const groups: ShareGroup[] = [
    {
      store: "Smith's",
      items: [
        { name: "Black beans", quantity: "2 cans", checked: false },
        { name: "Chicken thighs", quantity: "2 lb", checked: true },
      ],
    },
    { store: "Costco", items: [{ name: "Jasmine rice", quantity: "1 bag", checked: false }] },
    { store: "Kroger", items: [{ name: "Milk", quantity: "", checked: true }] },
  ];

  it("formats plain text grouped by store, unchecked only by default", () => {
    expect(shoppingListShareText("Oct 11 – 17", groups, false)).toBe(
      "Shopping list · Oct 11 – 17\n\nSmith's\n□ Black beans — 2 cans\n\nCostco\n□ Jasmine rice — 1 bag",
    );
    const all = shoppingListShareText("Oct 11 – 17", groups, true);
    expect(all).toContain("☑ Chicken thighs — 2 lb");
    expect(all).toContain("Kroger\n☑ Milk");
    expect(filterShareGroups(groups, false)).toHaveLength(2);
  });

  it("uses the locked banner, print and toast strings", () => {
    expect(listBannerLine(2, 7, 5)).toBe("2 of 7 checked · whole week · 5 dinners");
    expect(printSubline("Oct 11 – 17", 7)).toBe("Oct 11 – 17 · 7 items");
    expect(LIST_COPIED_TOAST).toBe("List copied.");
    const sheet = read("components/list-share.tsx");
    for (const slot of ["share-text", "share-image", "share-print", "share-include-checked", "share-cancel"]) {
      expect(sheet).toContain(slot);
    }
    expect(sheet).toContain("navigator.share");
    expect(sheet).toContain("navigator.clipboard.writeText");
    expect(sheet).toContain("window.print()");
    expect(sheet.replace(/tap-target/g, "")).not.toMatch(/\btap\b|iPhone|\$\d/);
  });
});

describe("House vs Settings", () => {
  it("splits household and you-and-this-app content", () => {
    const house = read("app/house/page.tsx");
    const settings = read("app/settings/page.tsx");
    for (const item of ["food-rules-house-row", "favorites-row", "past-weeks-row", "ManagePeople", "InviteShare", "PeoplePerNight", "HouseStores", "Weekly meal budget", "Finish setup"]) {
      expect(house, item).toContain(item);
    }
    for (const item of ["BotWakeSettings", "Sign out", "AppearancePicker", "UnlockWeekControl", "InstallPrompt"]) {
      expect(house, item).not.toContain(item);
    }
    for (const item of ["SIGN_OUT_LABEL", "AppearancePicker", "AddToHomeRow", "BotWakeSettings canEdit={owner}", "help-feedback-row", "version-row"]) {
      expect(settings, item).toContain(item);
    }
    expect(settings).not.toContain("ManagePeople");
    expect(settings).not.toContain("UnlockWeekControl");
    expect(house.indexOf("food-rules-house-row")).toBeLessThan(house.indexOf('data-slot="favorites-row"'));
    expect(favoritesRowLine(6)).toBe("6 meals");
    expect(favoritesRowLine(0)).toBeNull();
    expect(pastWeeksRowLine("2026-10-04", () => "Oct 4 – 10")).toBe("Last: Oct 4 – 10");
  });

  it("shows Wake your Bot read-only to non-admins", () => {
    const member = renderToStaticMarkup(createElement(BotWakeSettings, { canEdit: false, configured: true }));
    expect(member).toContain("Wake your Bot");
    expect(member).toContain(WAKE_READ_ONLY_NOTE);
    expect(member).not.toContain("<form");
    expect(member).not.toContain("<input");
    expect(member).not.toContain('data-slot="bot-wake-replace"');
    expect(member).not.toContain('data-slot="bot-check-now"');
    const admin = renderToStaticMarkup(createElement(BotWakeSettings, { canEdit: true, configured: false }));
    expect(admin).toContain("<form");
    expect(admin).not.toContain(WAKE_READ_ONLY_NOTE);
  });
});
