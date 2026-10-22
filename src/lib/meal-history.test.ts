import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  HISTORY_UI_LIMIT,
  PAST_WEEKS_EMPTY,
  PAST_WEEKS_HELPER,
  PAST_WEEKS_LABEL,
  dinnerCountLabel,
  historyDinnerCount,
  historyNightLine,
  historyWeekRowLabel,
  isFinishedWeek,
  isWeekEnded,
  listFinishedWeeks,
  parseMealHistory,
  saturdayOfWeek,
  type HistoryWeekSource,
} from "./meal-history";

const srcRoot = path.resolve(import.meta.dirname, "..");
const zone = "America/Los_Angeles";
const sundayAfter = new Date("2026-10-04T15:00:00Z");

describe("finished weeks", () => {
  it("ends the week the calendar day after that week's Saturday, in the house timezone", () => {
    expect(saturdayOfWeek("2026-09-27")).toBe("2026-10-03");
    expect(saturdayOfWeek("2026-09-28")).toBe("2026-10-03");
    expect(saturdayOfWeek("2026-10-03")).toBe("2026-10-03");

    const saturdayNightPacific = new Date("2026-10-04T06:30:00Z");
    expect(isWeekEnded("2026-09-27", zone, saturdayNightPacific)).toBe(false);
    expect(isWeekEnded("2026-09-27", "America/New_York", saturdayNightPacific)).toBe(true);
    expect(isWeekEnded("2026-09-27", zone, new Date("2026-10-04T07:30:00Z"))).toBe(true);
    expect(isWeekEnded("2026-09-27", "Not/AZone", saturdayNightPacific)).toBe(false);
  });

  it("requires lock and a Saturday that has already passed", () => {
    expect(isFinishedWeek("locked", "2026-09-27", zone, sundayAfter)).toBe(true);
    expect(isFinishedWeek("voting", "2026-09-27", zone, sundayAfter)).toBe(false);
    expect(isFinishedWeek("locked", "2026-10-04", zone, sundayAfter)).toBe(false);
  });

  it("keeps titles and plates, drops off and blank nights, and skips unlocked weeks", () => {
    const weeks: HistoryWeekSource[] = [
      {
        startsOn: "2026-09-27",
        status: "locked",
        nights: [
          { nightDate: "2026-09-27", title: "  Lemon-garlic chicken  ", plates: 4 },
          { nightDate: "2026-09-28", title: "Leftover tacos", plates: 4, off: true },
          { nightDate: "2026-09-29", title: "   ", plates: 2 },
          { nightDate: "2026-10-03", title: "Steak tacos", plates: 2 },
        ],
      },
      {
        startsOn: "2026-09-20",
        status: "voting",
        nights: [{ nightDate: "2026-09-20", title: "Abandoned chili", plates: 4 }],
      },
      {
        startsOn: "2026-10-04",
        status: "locked",
        nights: [{ nightDate: "2026-10-04", title: "Still this week", plates: 4 }],
      },
    ];

    expect(listFinishedWeeks(weeks, zone, sundayAfter)).toEqual([
      {
        startsOn: "2026-09-27",
        nights: [
          { nightDate: "2026-09-27", title: "Lemon-garlic chicken", plates: 4 },
          { nightDate: "2026-10-03", title: "Steak tacos", plates: 2 },
        ],
      },
    ]);

    const midweek = listFinishedWeeks(
      [
        {
          startsOn: "2026-09-27",
          status: "locked",
          plannedFrom: "2026-09-29",
          nights: [
            { nightDate: "2026-09-27", title: "Lemon-garlic chicken", plates: 4 },
            { nightDate: "2026-09-29", title: "Tacos", plates: 4 },
            { nightDate: "2026-10-03", title: "Steak tacos", plates: 2 },
          ],
        },
      ],
      zone,
      sundayAfter,
    );
    expect(midweek[0]?.nights).toEqual([
      { nightDate: "2026-09-27", title: "", plates: null, notPlanned: true },
      { nightDate: "2026-09-28", title: "", plates: null, notPlanned: true },
      { nightDate: "2026-09-29", title: "Tacos", plates: 4 },
      { nightDate: "2026-10-03", title: "Steak tacos", plates: 2 },
    ]);
    expect(historyDinnerCount(midweek[0]?.nights ?? [])).toBe(2);
  });

  it("lists at most 26 finished weeks, newest first", () => {
    const weeks: HistoryWeekSource[] = Array.from({ length: 30 }, (_, index) => {
      const startsOn = addDays("2026-09-27", -7 * index);
      return {
        startsOn,
        status: "locked" as const,
        nights: [{ nightDate: startsOn, title: `Dinner ${index}`, plates: 2 }],
      };
    });
    const listed = listFinishedWeeks(weeks, zone, sundayAfter);
    expect(HISTORY_UI_LIMIT).toBe(26);
    expect(listed).toHaveLength(26);
    expect(listed[0]?.startsOn).toBe("2026-09-27");
    expect(listed[25]?.startsOn).toBe(addDays("2026-09-27", -7 * 25));
    expect(listed.some((week) => week.startsOn === addDays("2026-09-27", -7 * 26))).toBe(false);
    expect(listed.map((week) => week.startsOn).join()).toBe(
      [...listed.map((week) => week.startsOn)].sort((a, b) => b.localeCompare(a)).join(),
    );
  });
});

describe("history copy", () => {
  it("matches the locked Past weeks strings", () => {
    expect(PAST_WEEKS_LABEL).toBe("Past weeks");
    expect(PAST_WEEKS_EMPTY).toBe(
      "No finished weeks yet. Locked weeks show up here after the week ends.",
    );
    expect(PAST_WEEKS_HELPER).toBe("Titles only — recipes aren’t kept for past weeks.");
    expect(dinnerCountLabel(1)).toBe("1 dinner");
    expect(dinnerCountLabel(7)).toBe("7 dinners");
    expect(historyWeekRowLabel("2026-09-27", 7)).toBe("Sep 27 – Oct 3 · 7 dinners");
    expect(historyWeekRowLabel("2026-09-27", 1)).toBe("Sep 27 – Oct 3 · 1 dinner");
    expect(
      historyNightLine({ nightDate: "2026-09-27", title: "Lemon-garlic chicken" }),
    ).toBe("Sun · Sep 27 · Lemon-garlic chicken");
    expect(
      historyNightLine({ nightDate: "2026-10-18", title: "", notPlanned: true }),
    ).toBe("Sun · Oct 18 · Not planned");
    expect(
      historyDinnerCount([
        { notPlanned: true },
        { notPlanned: true },
        { notPlanned: false },
        { notPlanned: false },
      ]),
    ).toBe(2);
  });
});

describe("history payload", () => {
  it("keeps only week start, night date, title, and plates", () => {
    const parsed = parseMealHistory([
      {
        startsOn: "2026-09-13",
        nights: [{ nightDate: "2026-09-13", title: "Soup", plates: 3 }],
      },
      {
        startsOn: "2026-09-20",
        pitch: "creamy",
        recipes: [{ steps: ["Simmer"] }],
        nights: [
          {
            nightDate: "2026-09-21",
            title: "Noodles",
            plates: 2,
            steps: ["Boil"],
            ingredients: [{ name: "Broth" }],
          },
          { nightDate: "2026-09-20", title: "  ", plates: 4 },
          { nightDate: "2026-09-20", title: "Early", plates: 4 },
        ],
      },
      { startsOn: "nope", nights: [{ nightDate: "2026-09-01", title: "Skip me", plates: 1 }] },
    ]);

    expect(parsed).toEqual([
      {
        startsOn: "2026-09-20",
        nights: [
          { nightDate: "2026-09-20", title: "Early", plates: 4 },
          { nightDate: "2026-09-21", title: "Noodles", plates: 2 },
        ],
      },
      {
        startsOn: "2026-09-13",
        nights: [{ nightDate: "2026-09-13", title: "Soup", plates: 3 }],
      },
    ]);
    const blob = JSON.stringify(parsed);
    expect(blob).not.toMatch(/steps|ingredients|Simmer|Broth|pitch|recipes|Boil/);
    expect(Object.keys(parsed[0]?.nights[0] ?? {}).sort()).toEqual(["nightDate", "plates", "title"]);
  });

  it("caps a large payload at 26 weeks", () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      startsOn: addDays("2026-09-27", -7 * index),
      nights: [],
    }));
    expect(parseMealHistory(rows)).toHaveLength(26);
    expect(parseMealHistory({ weeks: rows })).toEqual([]);
  });
});

describe("Past weeks surfaces", () => {
  it("lives under House and Meals, with no History tab and no recipe replay", () => {
    const shell = readFileSync(path.join(srcRoot, "lib/nav-tabs.ts"), "utf8");
    const settings = readFileSync(path.join(srcRoot, "app/house/page.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");
    const index = readFileSync(path.join(srcRoot, "app/house/past-weeks/page.tsx"), "utf8");
    const detail = readFileSync(
      path.join(srcRoot, "app/house/past-weeks/[startsOn]/page.tsx"),
      "utf8",
    );
    const view = readFileSync(path.join(srcRoot, "components/past-weeks.tsx"), "utf8");
    const history = `${index}\n${detail}\n${view}`;

    expect(shell.match(/href: "\//g)).toHaveLength(4);
    expect(shell).toContain('label: "House"');
    expect(shell).not.toMatch(/label:\s*"History"/);
    expect(shell).not.toContain("/house/past-weeks");

    expect(settings).toContain('data-slot="past-weeks-row"');
    expect(settings).toContain('href="/house/past-weeks"');
    expect(settings).toContain("PAST_WEEKS_LABEL");

    expect(week).toContain('data-slot="past-weeks-link"');
    expect(week).toContain("snapshot.mealHistory.length > 0");
    expect(week).toContain('href="/house/past-weeks"');
    expect(week).toContain("PAST_WEEKS_LABEL");

    expect(index).toContain('backHref="/house"');
    expect(index).toContain('backLabel="House"');
    expect(index).toContain("PastWeeksList");
    expect(detail).toContain("navigatorHref");
    expect(detail).toContain("router.replace");
    expect(view).toContain("PAST_WEEKS_EMPTY");
    expect(view).toContain("PAST_TITLES_ONLY");
    expect(view).toContain("navigatorHref");
    expect(view).toContain("historyNightLine");
    expect(view).toContain("historyWeekRowLabel");
    expect(view).toContain("HISTORY_UI_LIMIT");
    expect(index).toContain("PAST_WEEKS_HELPER");
    expect(week).toContain("PastWeekDetail");
    expect(history).not.toContain("/recipes");
    expect(history).not.toContain("/week/");
    expect(history).not.toMatch(/\bSwap\b/);
    expect(history).not.toMatch(/\bRemove\b/);
    expect(history).not.toMatch(/\bLock\b/);
  });

  it("stores titles in meal history and does not copy recipes or shopping lines", () => {
    const migration = readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20260927153000_meal_history.sql"),
      "utf8",
    );
    const repo = readFileSync(path.join(srcRoot, "lib/supabase/repo.ts"), "utf8");

    expect(migration).toContain("create table public.meal_history_nights");
    expect(migration).toContain("title text not null");
    expect(migration).toContain("plates integer");
    expect(migration).toContain("w.status = 'locked'");
    expect(migration).toContain("private.week_saturday");
    expect(migration).toContain("offset 26");
    expect(migration).toContain("latest.choice = 'remove'");
    expect(migration).not.toContain("public.recipes");
    expect(migration).not.toContain("recipe_ingredients");
    expect(migration).not.toContain("shopping_items");
    expect(migration).not.toContain("shopping_lists");
    expect(repo).toContain('client.rpc("meal_history")');
    expect(repo).toContain("parseMealHistory");

    const coverage = readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/migrations/20261022120000_week_planned_from.sql"),
      "utf8",
    );
    expect(coverage).toContain("add column if not exists planned_from date");
    expect(coverage).toContain("private.week_lock_covers_night(w.planned_from, m.night_date)");
    expect(coverage).toContain("'notPlanned', true");
    expect(coverage).not.toContain("update public.weeks set planned_from");
  });
});
