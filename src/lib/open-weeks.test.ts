import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostLockWaitingCard } from "@/components/post-lock-waiting";
import { addDays, formatWeekRange } from "./dates";
import {
  planningTargetStarts,
  shoppingListTitle,
  splitOpenWeeks,
  waitingWeekCue,
  weekHomeTitle,
  weekIsFinished,
  weekStartOn,
} from "./open-weeks";
import type { WeekStatus } from "./types";

function week(startsOn: string, status: WeekStatus = "voting") {
  return { id: startsOn, startsOn, status };
}

describe("open weeks", () => {
  const today = "2026-09-28";
  const cookingStart = "2026-09-27";

  it("starts the house week on the configured weekday", () => {
    expect(weekStartOn(today, 0)).toBe(cookingStart);
    expect(weekStartOn("2026-09-27", 0)).toBe(cookingStart);
    expect(weekStartOn("2026-10-03", 0)).toBe(cookingStart);
    expect(weekStartOn("2026-10-04", 0)).toBe("2026-10-04");
  });

  it("hides a switcher when only the cooking week exists", () => {
    const split = splitOpenWeeks([week(cookingStart, "locked")], today, 0);
    expect(split.cooking?.startsOn).toBe(cookingStart);
    expect(split.planning).toBeNull();
    expect(weekHomeTitle("cooking")).toBe("This week");
  });

  it("keeps cooking as home and planning as the single next week", () => {
    const split = splitOpenWeeks(
      [week(cookingStart, "locked"), week("2026-10-04", "voting")],
      today,
      0,
    );
    expect(split.cooking?.startsOn).toBe(cookingStart);
    expect(split.planning?.startsOn).toBe("2026-10-04");
    expect(weekHomeTitle("planning")).toBe("Next week");
    expect(shoppingListTitle("cooking")).toBe("Shopping · This week");
    expect(shoppingListTitle("planning")).toBe("Shopping · Next week");
    expect(waitingWeekCue("cooking", cookingStart)).toBeNull();
    expect(waitingWeekCue("cooking", cookingStart, { bothOpen: true })).toBe(
      `This week · ${formatWeekRange(cookingStart)}`,
    );
    expect(waitingWeekCue("planning", "2026-10-04")).toBe("Next week · Oct 4 – Oct 10");
  });

  it("does not surface a third open week", () => {
    const split = splitOpenWeeks(
      [week(cookingStart), week("2026-10-04"), week("2026-10-11")],
      today,
      0,
    );
    expect(split.cooking?.startsOn).toBe(cookingStart);
    expect(split.planning?.startsOn).toBe("2026-10-04");
    expect(split.planning?.startsOn).not.toBe("2026-10-11");
  });

  it("turns the former planning week into cooking after this week ends", () => {
    const nextToday = "2026-10-04";
    const split = splitOpenWeeks(
      [week(cookingStart, "locked"), week("2026-10-04", "voting")],
      nextToday,
      0,
    );
    expect(weekIsFinished({ startsOn: cookingStart, status: "locked" }, nextToday)).toBe(true);
    expect(split.cooking?.startsOn).toBe("2026-10-04");
    expect(split.planning).toBeNull();
  });

  it("keeps an unlocked planning week out of finished history", () => {
    expect(weekIsFinished({ startsOn: "2026-10-04", status: "voting" }, "2026-10-12")).toBe(false);
    expect(weekIsFinished({ startsOn: "2026-10-04", status: "locked" }, "2026-10-12")).toBe(true);
    expect(weekIsFinished({ startsOn: "2026-10-04", status: "locked" }, today)).toBe(false);
  });

  it("aims a saved request at the planning week, or the next start when that row is missing", () => {
    expect(
      planningTargetStarts({
        week: { startsOn: cookingStart } as never,
        planning: null,
      }),
    ).toBe(addDays(cookingStart, 7));
    expect(
      planningTargetStarts({
        week: { startsOn: cookingStart } as never,
        planning: { week: { startsOn: "2026-10-04" } } as never,
      }),
    ).toBe("2026-10-04");
  });

  it("names next week on the waiting card", () => {
    const html = renderToStaticMarkup(
      createElement(PostLockWaitingCard, {
        weekRole: "planning",
        startsOn: "2026-10-04",
        wakeConfigured: false,
      }),
    );
    expect(html).toContain("Waiting for your Bot");
    expect(html).toContain("Next week · Oct 4 – Oct 10");
    expect(html).toContain("shopping list for next week");
    expect(html).not.toContain("for this week");
  });
});
