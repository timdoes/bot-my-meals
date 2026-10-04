import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekProcessingMark } from "@/components/week-processing-mark";
import { BOT_CHECK_NOW_LABEL } from "./bot-check";
import {
  FOREGROUND_WEEK_REFRESH_MS,
  STILL_PROCESSING_LINE,
  UPDATING_WEEK_ANNOUNCEMENT,
  WEEK_PROCESSING_CAP_MS,
  bindForegroundWeekRefresh,
  createViewedWeekRefetch,
  shouldPaintWeekRefetch,
  shouldWakeAfterRefresh,
  syncProcessingClock,
  type ProcessingClock,
  type VisibilityDocument,
} from "./foreground-week-refresh";

const srcRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(srcRoot, "..");

function readSrc(rel: string) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function fakeDocument(initialHidden = false): VisibilityDocument & {
  setHidden: (hidden: boolean) => void;
  listenerCount: () => number;
} {
  let hidden = initialHidden;
  const listeners = new Set<() => void>();
  return {
    get hidden() {
      return hidden;
    },
    addEventListener(type: string, listener: () => void) {
      if (type !== "visibilitychange") return;
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener);
    },
    setHidden(next: boolean) {
      hidden = next;
      for (const listener of [...listeners]) listener();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function armedRefresh(doc: ReturnType<typeof fakeDocument>) {
  const refresh = vi.fn();
  const delays: number[] = [];
  let active = 0;
  const unbind = bindForegroundWeekRefresh({
    refresh,
    document: doc,
    setIntervalFn: (callback, ms) => {
      delays.push(ms);
      active += 1;
      return setInterval(callback, ms);
    },
    clearIntervalFn: (handle) => {
      active -= 1;
      clearInterval(handle);
    },
  });
  return {
    refresh,
    delays,
    unbind,
    active: () => active,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("foreground week refresh", () => {
  it("refetches every 30 seconds only while the week is visible", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(false);
    const timer = armedRefresh(doc);

    expect(FOREGROUND_WEEK_REFRESH_MS).toBe(30_000);
    expect(FOREGROUND_WEEK_REFRESH_MS).not.toBe(60_000);
    expect(timer.delays).toEqual([30_000]);
    expect(timer.active()).toBe(1);
    expect(timer.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(29_999);
    expect(timer.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(timer.refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(timer.refresh).toHaveBeenCalledTimes(2);

    doc.setHidden(true);
    expect(timer.active()).toBe(0);
    vi.advanceTimersByTime(5 * 60_000);
    expect(timer.refresh).toHaveBeenCalledTimes(2);

    doc.setHidden(false);
    expect(timer.active()).toBe(1);
    expect(timer.delays.at(-1)).toBe(30_000);
    vi.advanceTimersByTime(29_999);
    expect(timer.refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(timer.refresh).toHaveBeenCalledTimes(3);
  });

  it("does not run the timer while the document is hidden", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(true);
    const timer = armedRefresh(doc);

    expect(timer.delays).toEqual([]);
    expect(timer.active()).toBe(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(timer.refresh).not.toHaveBeenCalled();

    doc.setHidden(false);
    vi.advanceTimersByTime(30_000);
    expect(timer.refresh).toHaveBeenCalledTimes(1);
    expect(timer.delays.every((delay) => delay === 30_000)).toBe(true);
  });

  it("clears the timer when leaving the week and does not catch up", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(false);
    const timer = armedRefresh(doc);

    vi.advanceTimersByTime(30_000);
    expect(timer.refresh).toHaveBeenCalledTimes(1);

    timer.unbind();
    expect(timer.active()).toBe(0);
    expect(doc.listenerCount()).toBe(0);

    doc.setHidden(true);
    doc.setHidden(false);
    vi.advanceTimersByTime(10 * 60_000);
    expect(timer.refresh).toHaveBeenCalledTimes(1);
    expect(timer.active()).toBe(0);
    expect(doc.listenerCount()).toBe(0);
  });

  it("does not paint a week after the person leaves or switches weeks", async () => {
    const painted: string[] = [];
    let view: { weekId: string | null; screenActive: boolean } = {
      weekId: "this-week",
      screenActive: true,
    };
    const release: { current: ((value: string) => void) | null } = { current: null };
    const loads: string[] = [];
    const refetch = createViewedWeekRefetch({
      load: (weekId) => {
        loads.push(weekId);
        return new Promise<string>((resolve) => {
          release.current = resolve;
        });
      },
      paint: (weekId) => {
        painted.push(weekId);
      },
      viewing: () => view,
    });

    const pending = refetch("this-week");
    const skipped = refetch("this-week");
    expect(loads).toEqual(["this-week"]);
    view = { weekId: null, screenActive: false };
    release.current?.("this-week");
    await pending;
    await skipped;
    expect(painted).toEqual([]);

    view = { weekId: "next-week", screenActive: true };
    const releaseNext: { current: ((value: string) => void) | null } = { current: null };
    const switched = createViewedWeekRefetch({
      load: () =>
        new Promise<string>((resolve) => {
          releaseNext.current = resolve;
        }),
      paint: (weekId) => {
        painted.push(weekId);
      },
      viewing: () => view,
    });
    const late = switched("this-week");
    view = { weekId: "next-week", screenActive: true };
    releaseNext.current?.("this-week");
    await late;
    expect(painted).toEqual([]);
    expect(shouldPaintWeekRefetch({
      requestedWeekId: "this-week",
      viewingWeekId: "next-week",
      screenActive: true,
    })).toBe(false);
    expect(shouldPaintWeekRefetch({
      requestedWeekId: "next-week",
      viewingWeekId: "next-week",
      screenActive: true,
    })).toBe(true);
  });

  it("never wakes the bot from the foreground read", () => {
    expect(shouldWakeAfterRefresh({ fromPoll: true, previous: false, next: true })).toBe(false);
    expect(shouldWakeAfterRefresh({ fromPoll: true, previous: null, next: true })).toBe(false);
    expect(shouldWakeAfterRefresh({ fromPoll: true, previous: true, next: false })).toBe(false);
    expect(shouldWakeAfterRefresh({ fromPoll: false, previous: false, next: true })).toBe(true);
    expect(shouldWakeAfterRefresh({ fromPoll: false, previous: null, next: true })).toBe(false);
    expect(shouldWakeAfterRefresh({ fromPoll: false, previous: true, next: true })).toBe(false);

    const provider = readSrc("components/supper-provider.tsx");
    const hook = readSrc("components/use-foreground-week-refresh.ts");
    const lib = readSrc("lib/foreground-week-refresh.ts");
    const refetch = provider.slice(
      provider.indexOf("const refetchViewedWeek"),
      provider.indexOf("const dismissNotice"),
    );
    expect(provider).toContain("shouldWakeAfterRefresh");
    expect(provider).toContain("createViewedWeekRefetch");
    expect(refetch).not.toContain("requestBotWake");
    expect(refetch).not.toContain("check_now");
    expect(refetch).not.toContain("webhook");
    expect(hook).not.toContain("requestBotWake");
    expect(hook).not.toContain("check_now");
    expect(hook).not.toContain("webhook");
    expect(lib).not.toContain("requestBotWake");
    expect(readSrc("components/week-processing-mark.tsx")).not.toContain("requestBotWake");
  });
});

describe("week processing mark", () => {
  function step(
    clock: ProcessingClock | null,
    input: { waiting: boolean; active: boolean; now: number; signature?: string },
  ) {
    return syncProcessingClock(clock, {
      weekId: "week-1",
      signature: input.signature ?? "tacos",
      waiting: input.waiting,
      active: input.active,
      now: input.now,
    });
  }

  it("shows the bar only while that week is waiting, not on a quiet week with meals", () => {
    const quiet = step(null, { waiting: false, active: true, now: 0, signature: "meals:tacos,soup" });
    expect(quiet.phase).toBe("off");
    expect(quiet.clock).toBeNull();
    const quietHtml = renderToStaticMarkup(
      createElement(WeekProcessingMark, {
        phase: quiet.phase,
        stretchKey: "week-1",
        announce: false,
      }),
    );
    expect(quietHtml).not.toContain("week-processing-bar");
    expect(quietHtml).not.toContain(STILL_PROCESSING_LINE);

    const waiting = step(null, { waiting: true, active: true, now: 0, signature: "meals:tacos,soup" });
    expect(waiting.phase).toBe("bar");
    const barHtml = renderToStaticMarkup(
      createElement(WeekProcessingMark, {
        phase: "bar",
        stretchKey: "week-1:meals",
        announce: true,
      }),
    );
    expect(barHtml).toContain('data-slot="week-processing-bar"');
    expect(barHtml).toContain("height:2px");
    expect(barHtml).toContain("width:120px");
    expect(barHtml).toContain("max-width:120px");
    expect(barHtml).toContain(UPDATING_WEEK_ANNOUNCEMENT);
    expect(barHtml).not.toContain(STILL_PROCESSING_LINE);
    expect(barHtml).not.toContain("<button");
  });

  it("caps the waiting stretch at 5 minutes of foreground time and does not replay it", () => {
    expect(WEEK_PROCESSING_CAP_MS).toBe(5 * 60 * 1000);
    expect(WEEK_PROCESSING_CAP_MS).not.toBe(2 * 60 * 1000);
    expect(STILL_PROCESSING_LINE).toBe("Still processing.");

    let result = step(null, { waiting: true, active: true, now: 0 });
    expect(result.announce).toBe(true);
    expect(result.phase).toBe("bar");

    result = step(result.clock, { waiting: true, active: true, now: 4 * 60 * 1000 });
    expect(result.phase).toBe("bar");
    expect(result.announce).toBe(false);

    result = step(result.clock, { waiting: true, active: false, now: 4 * 60 * 1000 });
    expect(result.clock?.accumulatedMs).toBe(4 * 60 * 1000);
    expect(result.clock?.capped).toBe(false);

    const away = 4 * 60 * 1000 + 30 * 60 * 1000;
    result = step(result.clock, { waiting: true, active: true, now: away });
    expect(result.phase).toBe("bar");
    expect(result.clock?.capped).toBe(false);
    expect(result.announce).toBe(false);

    result = step(result.clock, { waiting: true, active: true, now: away + 60 * 1000 });
    expect(result.phase).toBe("capped");

    result = step(result.clock, { waiting: true, active: false, now: away + 60 * 1000 });
    result = step(result.clock, { waiting: true, active: true, now: away + 90 * 60 * 1000 });
    expect(result.phase).toBe("capped");
    expect(result.announce).toBe(false);

    const html = renderToStaticMarkup(
      createElement(WeekProcessingMark, {
        phase: "capped",
        stretchKey: "week-1",
        announce: false,
      }),
    );
    expect(html).toContain("Still processing.");
    expect(html).toContain('data-slot="still-processing"');
    expect(html).not.toContain("week-processing-bar");
    expect(html).not.toContain("week-processing-fill");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Check now");
    expect(html).not.toContain("Get recipes now");

    const changed = step(result.clock, {
      waiting: true,
      active: true,
      now: away + 91 * 60 * 1000,
      signature: "meals:landed",
    });
    expect(changed.phase).toBe("bar");
    expect(changed.clock?.capped).toBe(false);
    expect(changed.clock?.accumulatedMs).toBe(0);

    const settled = step(changed.clock, {
      waiting: false,
      active: true,
      now: away + 92 * 60 * 1000,
      signature: "meals:landed",
    });
    expect(settled.phase).toBe("off");
    expect(settled.clock).toBeNull();
  });

  it("keeps one Check now and does not put the mark on other screens", () => {
    const week = readSrc("app/week/page.tsx");
    const check = readSrc("components/bot-check-frequency.tsx");
    const waiting = readSrc("components/post-lock-waiting.tsx");
    const mark = readSrc("components/week-processing-mark.tsx");
    const chrome = readSrc("components/week-chrome.tsx");
    const css = readSrc("app/globals.css");
    const meal = readSrc("app/week/[mealId]/page.tsx");
    const settings = readSrc("app/settings/page.tsx");
    const list = readSrc("app/list/page.tsx");
    const recipes = readSrc("app/recipes/page.tsx");
    const worker = readFileSync(path.join(repoRoot, "public/sw.js"), "utf8");

    expect(BOT_CHECK_NOW_LABEL).toBe("Check now");
    expect(check.match(/idleLabel=\{BOT_CHECK_NOW_LABEL\}/g)?.length).toBe(2);
    expect(week.match(/<WaitingBotCheck/g)?.length).toBe(2);
    expect(waiting).toContain("BOT_CHECK_NOW_LABEL");
    expect(waiting).toContain("POST_LOCK_GET_RECIPES_LABEL");
    expect(mark).not.toContain("Check now");
    expect(mark).not.toContain("Get recipes now");
    expect(mark).not.toContain("<button");
    expect(mark).toContain("STILL_PROCESSING_LINE");
    expect(mark).toContain("UPDATING_WEEK_ANNOUNCEMENT");
    expect(mark).not.toMatch(/30 seconds|Adaptive|countdown|\bpoll\b/i);
    expect(STILL_PROCESSING_LINE).toBe("Still processing.");
    expect(UPDATING_WEEK_ANNOUNCEMENT).toBe("Updating this week.");

    expect(week).toContain("useForegroundWeekRefresh");
    expect(week).toContain("<WeekProcessingMark");
    expect(chrome.indexOf("{processing}")).toBeLessThan(chrome.indexOf("<WeekNavigator"));
    expect(css).toContain("week-processing-travel");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");

    expect(meal).not.toContain("useForegroundWeekRefresh");
    expect(meal).not.toContain("WeekProcessingMark");
    expect(settings).not.toContain("WeekProcessingMark");
    expect(settings).not.toContain("useForegroundWeekRefresh");
    expect(list).not.toContain("WeekProcessingMark");
    expect(recipes).not.toContain("WeekProcessingMark");
    expect(worker).not.toContain("setInterval");
    expect(worker).not.toContain("foreground-week-refresh");
    expect(readSrc("app/layout.tsx")).not.toContain("useForegroundWeekRefresh");
  });
});
