import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeekNavigator } from "@/components/week-navigator";
import { addDays } from "./dates";
import {
  EARLIER_WEEK_LABEL,
  LATER_WEEK_LABEL,
  PAST_EYEBROW,
  PAST_TITLES_ONLY,
  WEEK_SWIPE_THRESHOLD_PX,
  commitWeekSwipe,
  futureSwipeCreatesPlanning,
  navigatorEyebrow,
  navigatorHref,
  navigatorStops,
  navigatorTitle,
  resolveNavigatorIndex,
  stepNavigator,
} from "./week-navigator";

const cooking = "2026-09-27";
const planning = "2026-10-04";

describe("week navigator continuum", () => {
  it("starts at cooking when history exists and no selection is stored", () => {
    const stops = navigatorStops({
      historyStartsOn: [addDays(cooking, -7), addDays(cooking, -14)],
      cookingStartsOn: cooking,
      planningStartsOn: planning,
    });
    expect(stops.map((stop) => stop.kind)).toEqual(["past", "past", "cooking", "planning"]);
    expect(stops[0]?.startsOn).toBe(addDays(cooking, -14));
    expect(resolveNavigatorIndex(stops, { kind: "cooking" })).toBe(2);
    expect(navigatorTitle(stops[2]!)).toBe("This week");
    expect(navigatorTitle(stops[3]!)).toBe("Next week");
    expect(navigatorEyebrow(stops[2]!)).toEqual({ text: "Sep 27 – Oct 3", muted: false });
  });

  it("keeps the newest 26 finished weeks and never adds a week after planning", () => {
    const history = Array.from({ length: 30 }, (_, index) => addDays(cooking, -7 * (index + 1)));
    const stops = navigatorStops({
      historyStartsOn: [...history, planning, "2026-10-11"],
      cookingStartsOn: cooking,
      planningStartsOn: planning,
    });
    const past = stops.filter((stop) => stop.kind === "past");
    expect(past).toHaveLength(26);
    expect(past[0]?.startsOn).toBe(addDays(cooking, -7 * 26));
    expect(past[25]?.startsOn).toBe(addDays(cooking, -7));
    expect(stops.filter((stop) => stop.kind === "planning")).toHaveLength(1);
    expect(stops.some((stop) => stop.startsOn === "2026-10-11")).toBe(false);
    const future = stepNavigator(stops, stops.length - 1, 1);
    expect(future.moved).toBe(false);
    expect(future.stop.kind).toBe("planning");
  });

  it("soft-stops at the oldest week and at cooking when planning is missing", () => {
    const stops = navigatorStops({
      historyStartsOn: [addDays(cooking, -7)],
      cookingStartsOn: cooking,
      planningStartsOn: null,
    });
    expect(stepNavigator(stops, 0, -1).moved).toBe(false);
    const toCooking = stepNavigator(stops, 0, 1);
    expect(toCooking.moved).toBe(true);
    expect(toCooking.stop.kind).toBe("cooking");
    expect(stepNavigator(stops, toCooking.index, 1).moved).toBe(false);
    expect(navigatorHref({ kind: "past", startsOn: addDays(cooking, -7) })).toBe(
      `/week?past=${addDays(cooking, -7)}`,
    );
    expect(navigatorHref({ kind: "cooking" })).toBe("/week");
    expect(navigatorHref({ kind: "planning" })).toBe("/week?week=next");
  });

  it("labels a finished week with the date range and a muted Past eyebrow", () => {
    const stop = { kind: "past" as const, startsOn: "2026-09-13" };
    expect(navigatorTitle(stop)).toBe("Sep 13 – Sep 19");
    expect(navigatorEyebrow(stop)).toEqual({ text: PAST_EYEBROW, muted: true });
    expect(PAST_EYEBROW).toBe("Past");
    expect(PAST_TITLES_ONLY).toBe("Titles only");
    const index = resolveNavigatorIndex(
      navigatorStops({
        historyStartsOn: ["2026-09-13"],
        cookingStartsOn: cooking,
        planningStartsOn: null,
      }),
      { kind: "past", startsOn: "2026-09-13" },
    );
    expect(index).toBe(0);
    expect(
      resolveNavigatorIndex(
        navigatorStops({
          historyStartsOn: ["2026-09-13"],
          cookingStartsOn: cooking,
          planningStartsOn: null,
        }),
        { kind: "past", startsOn: "1999-01-01" },
      ),
    ).toBe(1);
  });

  it("treats a clear horizontal pan as a week change and leaves taps and vertical pans alone", () => {
    expect(WEEK_SWIPE_THRESHOLD_PX).toBeGreaterThanOrEqual(24);
    expect(commitWeekSwipe(-WEEK_SWIPE_THRESHOLD_PX, 4)).toBe(1);
    expect(commitWeekSwipe(WEEK_SWIPE_THRESHOLD_PX, 4)).toBe(-1);
    expect(commitWeekSwipe(-10, 2)).toBeNull();
    expect(commitWeekSwipe(-80, 90)).toBeNull();
    expect(EARLIER_WEEK_LABEL).toBe("Earlier week");
    expect(LATER_WEEK_LABEL).toBe("Later week");
  });

  it("creates next week from cooking’s future edge and refuses a week after next", () => {
    expect(
      futureSwipeCreatesPlanning({
        direction: 1,
        moved: false,
        kind: "cooking",
        hasPlanning: false,
        canPlan: true,
      }),
    ).toBe(true);
    expect(
      futureSwipeCreatesPlanning({
        direction: 1,
        moved: false,
        kind: "planning",
        hasPlanning: true,
        canPlan: true,
      }),
    ).toBe(false);
    expect(
      futureSwipeCreatesPlanning({
        direction: 1,
        moved: true,
        kind: "cooking",
        hasPlanning: true,
        canPlan: true,
      }),
    ).toBe(false);
    expect(
      futureSwipeCreatesPlanning({
        direction: -1,
        moved: false,
        kind: "cooking",
        hasPlanning: false,
        canPlan: true,
      }),
    ).toBe(false);
    expect(
      futureSwipeCreatesPlanning({
        direction: 1,
        moved: false,
        kind: "cooking",
        hasPlanning: false,
        canPlan: false,
      }),
    ).toBe(false);
  });
});

describe("week navigator chrome", () => {
  it("renders edge chevrons over a light-blue seven-day band", () => {
    const html = renderToStaticMarkup(
      createElement(WeekNavigator, {
        startsOn: cooking,
        nights: [{ id: "mon", nightDate: "2026-09-28", hasMeal: true }],
        selectedMealId: null,
        todayIso: "2026-09-28",
        onSelect: () => undefined,
        onStep: () => false,
      }),
    );
    expect(html).toContain('data-slot="week-navigator"');
    expect(html).toContain("bg-secondary");
    expect(html).toContain("h-[52px]");
    expect(html).toContain('data-slot="week-nav-previous"');
    expect(html).toContain('data-slot="week-nav-next"');
    // Chevrons 44×48 (NAV-TABS lock §3).
    expect(html).toContain("h-12 w-11");
    expect(html).toContain('data-slot="week-nav-fade"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("z-20");
    expect(html).toContain("Earlier week");
    expect(html).toContain("Later week");
    expect(html.match(/data-slot="week-strip-cell"/g)).toHaveLength(7);
    expect(html).not.toContain('data-slot="week-switcher"');
    expect(html).not.toContain("mt-");
  });
});
