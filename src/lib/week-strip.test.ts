import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WeekStrip } from "@/components/week-strip";
import { focusNightCard, nightCardAnchorId, weekStripCells } from "./week-strip";

const crossMonth = [
  { id: "sun", nightDate: "2026-09-27", hasMeal: true },
  { id: "mon", nightDate: "2026-09-28", hasMeal: true },
  { id: "tue", nightDate: "2026-09-29", hasMeal: true },
  { id: "wed", nightDate: "2026-09-30", hasMeal: true },
  { id: "thu", nightDate: "2026-10-01", hasMeal: true },
  { id: "fri", nightDate: "2026-10-02", hasMeal: true },
  { id: "sat", nightDate: "2026-10-03", hasMeal: true },
];

describe("weekStripCells", () => {
  it("builds seven compact cells and shows the month when it flips", () => {
    const cells = weekStripCells("2026-09-27", crossMonth);
    expect(cells).toHaveLength(7);
    expect(cells.map((cell) => cell.letter)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(cells.map((cell) => cell.day)).toEqual([27, 28, 29, 30, 1, 2, 3]);
    expect(cells.map((cell) => cell.month)).toEqual(["Sep", null, null, null, "Oct", null, null]);
    expect(cells.every((cell) => cell.hasMeal)).toBe(true);
  });

  it("shows the month only on the first cell when the week stays in one month", () => {
    const cells = weekStripCells("2026-10-04", [
      { id: "sun", nightDate: "2026-10-04", hasMeal: true },
      { id: "mon", nightDate: "2026-10-05", hasMeal: true },
      { id: "sat", nightDate: "2026-10-10", hasMeal: true },
    ]);
    expect(cells).toHaveLength(7);
    expect(cells.map((cell) => cell.month)).toEqual(["Oct", null, null, null, null, null, null]);
    expect(cells.map((cell) => cell.day)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(cells.map((cell) => cell.hasMeal)).toEqual([true, true, false, false, false, false, true]);
    expect(cells.map((cell) => cell.mealId)).toEqual(["sun", "mon", null, null, null, null, "sat"]);
  });

  it("keeps empty and pending nights in the seven days without making them selectable", () => {
    const cells = weekStripCells("2026-09-27", [
      { id: "mon", nightDate: "2026-09-28", hasMeal: true },
      { id: "thu", nightDate: "2026-10-01", hasMeal: false },
      { id: "fri", nightDate: "2026-10-02", hasMeal: true },
    ]);
    expect(cells.map((cell) => cell.letter)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(cells.map((cell) => cell.hasMeal)).toEqual([false, true, false, false, false, true, false]);
    expect(cells.map((cell) => cell.mealId)).toEqual([null, "mon", null, null, null, "fri", null]);
    expect(cells.map((cell) => cell.month)).toEqual(["Sep", null, null, null, "Oct", null, null]);
  });
});

describe("focusNightCard", () => {
  it("scrolls and focuses that night's card without leaving the list", () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    const found = focusNightCard("thu", (id) => {
      expect(id).toBe(nightCardAnchorId("thu"));
      return { scrollIntoView, focus };
    });
    expect(found).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does nothing when the card is missing", () => {
    expect(focusNightCard("missing", () => null)).toBe(false);
  });
});

describe("This week strip", () => {
  it("sits under the header, jumps inside the list, and leaves card actions in place", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const week = readFileSync(path.join(root, "app/week/page.tsx"), "utf8");
    const chrome = readFileSync(path.join(root, "components/week-chrome.tsx"), "utf8");
    const navigatorSource = readFileSync(path.join(root, "components/week-navigator.tsx"), "utf8");
    const strip = readFileSync(path.join(root, "components/week-strip.tsx"), "utf8");
    const card = readFileSync(path.join(root, "components/ballot-card.tsx"), "utf8");

    expect(week).toContain("<WeekChrome");
    expect(week).toContain("chrome={");
    expect(week).toContain("focusNightCard");
    expect(week).toContain("nightCardAnchorId");
    expect(week).toContain("<BallotCard");
    expect(week).toContain("<EmptyDayCard");
    expect(week).toContain("<LockBar");
    expect(week).toContain("PastWeekDetail");
    expect(week).not.toContain("Calendar");
    expect(week).not.toContain("month-grid");
    expect(week).not.toContain("WeekSwitcher");
    expect(week).not.toContain('data-slot="week-switcher"');
    expect(chrome).toContain("<WeekNavigator");
    expect(chrome).not.toContain("sticky");
    expect(chrome).not.toContain("top-[calc(var(--shell-head-h)-1px)]");
    const shell = readFileSync(path.join(root, "components/app-shell.tsx"), "utf8");
    expect(shell).toContain('data-slot="shell-chrome"');
    expect(shell).toContain('chrome ? "pb-0" : "pb-3"');
    expect(navigatorSource).toContain('data-slot="week-navigator"');
    expect(navigatorSource).toContain("bg-secondary");
    expect(navigatorSource).toContain("h-[52px]");
    expect(navigatorSource).toContain("week-nav-previous");
    expect(navigatorSource).toContain("week-nav-next");
    expect(navigatorSource).toContain("h-12 w-11");
    expect(strip).toContain('data-slot="week-strip"');
    expect(strip).toContain("h-[44px]");
    expect(strip).toContain("min-h-[44px]");
    expect(strip).toContain("min-w-[44px]");
    expect(strip).toContain("gap-2");
    expect(strip).toContain("py-1");
    expect(strip).not.toContain("py-3");
    expect(strip).not.toContain("h-3");
    expect(strip).toContain("flex-1");
    expect(strip).toContain('data-empty="true"');
    expect(strip).toContain('data-selectable="false"');
    expect(strip).toContain("font-medium");
    expect(strip).toContain('type="button"');
    expect(week).toContain("nightHasStripMeal");
    expect(week).toContain("activeStop?.startsOn");
    expect(strip).not.toContain("<Lock");
    expect(strip).not.toContain("lucide-react");
    expect(strip).not.toContain("href=");
    expect(strip).not.toContain("Calendar");
    expect(card).toMatch(/>\s*Swap\s*</);
    expect(card).toMatch(/>\s*Remove\s*</);
  });

  it("renders all seven days and only meal nights as tappable cells", () => {
    const html = renderToStaticMarkup(
      createElement(WeekStrip, {
        startsOn: "2026-09-27",
        nights: [
          { id: "sun", nightDate: "2026-09-27", hasMeal: false },
          { id: "mon", nightDate: "2026-09-28", hasMeal: true },
          { id: "wed", nightDate: "2026-09-30", hasMeal: true },
        ],
        selectedMealId: "sun",
        todayIso: "2026-09-27",
        mutedDates: ["2026-09-27"],
        onSelect: () => undefined,
      }),
    );
    expect(html.match(/data-slot="week-strip-cell"/g)).toHaveLength(7);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.match(/data-empty="true"/g)).toHaveLength(5);
    expect(html.match(/data-selectable="true"/g)).toHaveLength(2);
    expect(html).toContain('data-meal-id="mon"');
    expect(html).toContain('data-meal-id="wed"');
    expect(html).not.toContain('data-meal-id="sun"');
    expect(html).not.toContain('data-today="true"');
    expect(html).not.toContain('data-selected="true"');
    expect(html).not.toContain("bg-primary");
    expect(html).toContain("font-medium");
    expect(html).toContain("font-semibold");
    expect(html).not.toContain("read only");
  });

  it("keeps today and past-lock states on meal nights only", () => {
    const html = renderToStaticMarkup(
      createElement(WeekStrip, {
        startsOn: "2026-09-27",
        nights: [
          { id: "sun", nightDate: "2026-09-27", hasMeal: true },
          { id: "mon", nightDate: "2026-09-28", hasMeal: true },
          { id: "tue", nightDate: "2026-09-29", hasMeal: false },
        ],
        selectedMealId: "mon",
        todayIso: "2026-09-28",
        mutedDates: ["2026-09-27"],
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain('data-today="true"');
    expect(html).toContain("bg-primary");
    expect(html).toContain('data-past="true"');
    expect(html).toContain("Sun · Sep 27, read only");
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-empty="true"');
    expect(html).not.toContain(", locked");
  });
});
