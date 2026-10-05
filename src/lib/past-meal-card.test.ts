import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BallotCard } from "@/components/ballot-card";
import { EmptyDayCard } from "@/components/empty-day-card";
import { todayInTimeZone } from "./meal-history";
import { lockedDinnerTap } from "./post-lock-waiting";
import {
  MADE_CHIP_LABEL,
  dinnerNightActionsOpen,
  isPastDinnerNight,
  mealNightPhase,
} from "./week-chrome";

const srcRoot = path.resolve(import.meta.dirname, "..");

function mealCard(made: boolean) {
  return renderToStaticMarkup(
    createElement(BallotCard, {
      dayLabel: "Sun · Oct 4",
      confirmDayLabel: "Sunday",
      title: "Lemon roast chicken",
      pitch: "Crisp and bright",
      servings: 4,
      made,
      openHref: "/week/sun",
      onSwap: () => undefined,
      onRemove: () => undefined,
    }),
  );
}

describe("house timezone past nights", () => {
  it("treats a night as past only after that local calendar day has ended", () => {
    const acrossZones = new Date("2026-10-05T06:30:00.000Z");
    const denverToday = todayInTimeZone(acrossZones, "America/Denver");
    const honoluluToday = todayInTimeZone(acrossZones, "Pacific/Honolulu");

    expect(denverToday).toBe("2026-10-05");
    expect(honoluluToday).toBe("2026-10-04");
    expect(mealNightPhase("2026-10-04", denverToday)).toBe("past");
    expect(mealNightPhase("2026-10-05", denverToday)).toBe("today");
    expect(mealNightPhase("2026-10-06", denverToday)).toBe("future");
    expect(isPastDinnerNight("2026-10-04", honoluluToday)).toBe(false);
    expect(mealNightPhase("2026-10-04", honoluluToday)).toBe("today");
    expect(mealNightPhase("2026-10-05", honoluluToday)).toBe("future");

    const beforeDenverMidnight = new Date("2026-10-05T05:59:00.000Z");
    const stillSunday = todayInTimeZone(beforeDenverMidnight, "America/Denver");
    expect(stillSunday).toBe("2026-10-04");
    expect(isPastDinnerNight("2026-10-04", stillSunday)).toBe(false);
    expect(mealNightPhase("2026-10-04", stillSunday)).toBe("today");

    const afterDenverMidnight = new Date("2026-10-05T06:00:00.000Z");
    const monday = todayInTimeZone(afterDenverMidnight, "America/Denver");
    expect(monday).toBe("2026-10-05");
    expect(isPastDinnerNight("2026-10-04", monday)).toBe(true);
    expect(isPastDinnerNight("2026-10-05", monday)).toBe(false);
    expect(mealNightPhase("2026-10-05", monday)).toBe("today");
    expect(mealNightPhase("2026-10-06", monday)).toBe("future");
  });

  it("keeps past nights non-editable while the week is locked or unlocked", () => {
    expect(dinnerNightActionsOpen({ past: true, nightLocked: false, canAct: true })).toBe(false);
    expect(dinnerNightActionsOpen({ past: true, nightLocked: true, canAct: true })).toBe(false);
    expect(dinnerNightActionsOpen({ past: false, nightLocked: true, canAct: true })).toBe(false);
    expect(dinnerNightActionsOpen({ past: false, nightLocked: false, canAct: true })).toBe(true);
    expect(dinnerNightActionsOpen({ past: false, nightLocked: false, canAct: false })).toBe(false);
  });
});

describe("past, today, and future meal cards", () => {
  it("shows a full Made card for past nights and leaves today and future cards actionable", () => {
    expect(MADE_CHIP_LABEL).toBe("Made");

    const past = mealCard(true);
    const today = mealCard(false);
    const future = mealCard(false);

    expect(future).toBe(today);
    expect(past).toContain('data-past="true"');
    expect(past).toContain('data-slot="made-chip"');
    expect(past).toContain(">Made<");
    expect(past).toContain("Sun · Oct 4");
    expect(past).toContain("Lemon roast chicken");
    expect(past).toContain("type-section");
    expect(past).toContain("rounded-[14px]");
    expect(past).toContain("p-4");
    expect(past).toContain("text-foreground/80");
    expect(past).toContain("[&amp;_img]:opacity-80");
    expect(past).toContain('href="/week/sun"');
    expect(past).toContain(">4<");
    expect(past).toContain("servings");
    expect(past).not.toMatch(/>\s*Swap\s*</);
    expect(past).not.toMatch(/>\s*Remove\s*</);
    expect(past).not.toContain("Request a new dinner");
    expect(past).not.toContain("dinner-people-stepper");
    expect(past).not.toContain("Fewer people");
    expect(past).not.toContain("week-locked-chip");
    expect(past).not.toContain("<svg");

    const dayAt = past.indexOf('data-slot="meal-day-label"');
    const chipAt = past.indexOf('data-slot="made-chip"');
    const titleAt = past.indexOf('data-slot="meal-card-title"');
    expect(dayAt).toBeGreaterThan(-1);
    expect(chipAt).toBeGreaterThan(dayAt);
    expect(titleAt).toBeGreaterThan(chipAt);
    const titleTag = past.slice(past.lastIndexOf("<h2", titleAt), past.indexOf("</h2>", titleAt));
    expect(titleTag).toContain("text-foreground/80");
    expect(titleTag).toContain("type-section");
    expect(titleTag).not.toContain("text-muted-foreground");
    const chip = past.slice(chipAt, past.indexOf("</span>", chipAt) + "</span>".length);
    expect(chip).toContain(">Made</span>");
    expect(chip).toContain("bg-foreground");
    expect(chip).not.toContain("opacity-80");

    expect(today).toContain('data-past="false"');
    expect(today).not.toContain('data-slot="made-chip"');
    expect(today).not.toContain(">Made<");
    expect(today).not.toContain("text-foreground/80");
    expect(today).toContain(">Swap<");
    expect(today).toContain(">Remove<");
    expect(today).toContain("Sun · Oct 4");
    expect(today).toContain("Lemon roast chicken");
    expect(today).toContain('href="/week/sun"');
    expect(today).toContain(">4<");
  });

  it("opens a past dinner for review and does not open the waiting sheet", () => {
    expect(lockedDinnerTap({ locked: true, pending: true, presentation: "ballot", past: true })).toBe(
      "review",
    );
    expect(lockedDinnerTap({ locked: false, pending: false, presentation: "ballot", past: true })).toBe(
      "review",
    );
    expect(
      lockedDinnerTap({ locked: true, pending: true, presentation: "locked_empty", past: true }),
    ).toBe("none");
    expect(lockedDinnerTap({ locked: true, pending: true, presentation: "ballot" })).toBe("waiting");
    expect(lockedDinnerTap({ locked: true, pending: false, presentation: "ballot" })).toBe("recipe");
    expect(lockedDinnerTap({ locked: false, pending: false, presentation: "ballot" })).toBe("none");

    const frame = readFileSync(path.join(srcRoot, "components/post-lock-waiting.tsx"), "utf8");
    const reviewCase = frame.slice(frame.indexOf('case "review"'), frame.indexOf("default:", frame.indexOf('case "review"')));
    expect(reviewCase).toContain('data-slot={tap === "review" ? "past-meal-review" : "locked-night-recipe"}');
    expect(reviewCase).toContain("<Link");
    expect(reviewCase).not.toContain("onWaiting");
    expect(reviewCase).not.toContain("locked-night-waiting");
  });

  it("keeps an empty past night as a full card without add or a people stepper", () => {
    const pastEmpty = renderToStaticMarkup(
      createElement(EmptyDayCard, {
        dayLabel: "Sun · Oct 4",
        dayName: "Sunday",
        state: "empty",
        servings: 2,
      }),
    );
    expect(pastEmpty).toContain('data-slot="empty-day-card"');
    expect(pastEmpty).toContain("p-4");
    expect(pastEmpty).toContain("Sun · Oct 4");
    expect(pastEmpty).toContain("No dinner");
    expect(pastEmpty).not.toContain("Add meal");
    expect(pastEmpty).not.toContain("dinner-people-stepper");
    expect(pastEmpty).not.toContain("Request a new dinner");
    expect(pastEmpty).not.toContain(">Made<");

    const todayEmpty = renderToStaticMarkup(
      createElement(EmptyDayCard, {
        dayLabel: "Wed · Oct 7",
        dayName: "Wednesday",
        state: "empty",
        servings: 4,
        onAdd: () => undefined,
      }),
    );
    expect(todayEmpty).toContain("Add meal");
    expect(todayEmpty).toContain("p-4");
  });

  it("wires cooking Home and meal review without a demo store or a card wake", () => {
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");
    const meal = readFileSync(path.join(srcRoot, "app/week/[mealId]/page.tsx"), "utf8");
    const card = readFileSync(path.join(srcRoot, "components/ballot-card.tsx"), "utf8");

    expect(week).toContain("isPastDinnerNight(meal.nightDate, todayIso)");
    expect(week).toContain('role === "cooking" && isPastDinnerNight');
    expect(week).toContain("dinnerNightActionsOpen");
    expect(week).toContain("made={past}");
    expect(week).toContain("past: pastNight");
    expect(week).toContain("UnlockWeekControl");
    expect(week).not.toContain("localStorage");
    expect(meal).toContain("isPastDinnerNight");
    expect(meal).toContain("const readOnly = weekLocked || pastLocked || calendarPast");
    expect(meal).not.toContain("requestBotWake");
    expect(meal).not.toContain("localStorage");
    expect(card).toContain("MADE_CHIP_LABEL");
    expect(card).not.toContain("localStorage");
    expect(card).not.toContain("<Lock");
  });
});
