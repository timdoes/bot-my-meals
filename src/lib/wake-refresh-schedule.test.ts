import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WeekProcessingMark } from "@/components/week-processing-mark";
import {
  BOT_WORKING_LINE,
  BURST_FAST_MS,
  BURST_FAST_WINDOW_MS,
  BURST_SLOW_MS,
  BURST_TOTAL_MS,
  burstDelayMs,
  createBurst,
  nextBotWorking,
  type BurstEnv,
} from "./wake-refresh-schedule";

function fakeEnv(hidden = false) {
  let t = 0;
  let id = 0;
  let isHidden = hidden;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const listeners = new Set<() => void>();
  const env: BurstEnv = {
    now: () => t,
    setTimeout: (cb, ms) => {
      id += 1;
      timers.set(id, { at: t + ms, cb });
      return id;
    },
    clearTimeout: (n) => void timers.delete(n),
    isHidden: () => isHidden,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      t = next[1].at;
      timers.delete(next[0]);
      next[1].cb();
    }
    t = end;
  };
  return {
    env,
    advance,
    setHidden(next: boolean) {
      isHidden = next;
      listeners.forEach((cb) => cb());
    },
    timers: () => timers.size,
    listeners: () => listeners.size,
  };
}

describe("burst schedule", () => {
  it("is 5 s for 2 minutes, then 15 s until 5 minutes, then over", () => {
    expect(BURST_FAST_MS).toBe(5_000);
    expect(BURST_FAST_WINDOW_MS).toBe(120_000);
    expect(BURST_SLOW_MS).toBe(15_000);
    expect(BURST_TOTAL_MS).toBe(300_000);
    expect(burstDelayMs(0)).toBe(5_000);
    expect(burstDelayMs(119_999)).toBe(5_000);
    expect(burstDelayMs(120_000)).toBe(15_000);
    expect(burstDelayMs(299_999)).toBe(15_000);
    expect(burstDelayMs(300_000)).toBeNull();
  });

  it("ticks now, every 5 s, then every 15 s, and ends once", () => {
    const f = fakeEnv();
    const refresh = vi.fn();
    const onEnd = vi.fn();
    const burst = createBurst({ env: f.env, refresh, onEnd });
    burst.start();
    expect(refresh).toHaveBeenCalledTimes(1);
    f.advance(120_000);
    expect(refresh).toHaveBeenCalledTimes(1 + 24);
    f.advance(180_000);
    expect(refresh).toHaveBeenCalledTimes(1 + 24 + 11);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(burst.isRunning()).toBe(false);
    expect(f.timers()).toBe(0);
    expect(f.listeners()).toBe(0);
    f.advance(600_000);
    expect(refresh).toHaveBeenCalledTimes(36);
  });

  it("runs nothing while hidden, refreshes once on return, and keeps the same end time", () => {
    const f = fakeEnv();
    const refresh = vi.fn();
    const burst = createBurst({ env: f.env, refresh });
    burst.start();
    f.advance(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    f.setHidden(true);
    expect(f.timers()).toBe(0);
    f.advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    f.setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(4);
    f.advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(5);
    f.setHidden(true);
    f.advance(400_000);
    f.setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(burst.isRunning()).toBe(false);
  });

  it("does not tick at all when started hidden; stop ends it", () => {
    const f = fakeEnv(true);
    const refresh = vi.fn();
    const onEnd = vi.fn();
    const burst = createBurst({ env: f.env, refresh, onEnd });
    burst.start();
    f.advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
    f.setHidden(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    burst.stop();
    burst.stop();
    expect(onEnd).toHaveBeenCalledTimes(1);
    f.advance(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a second wake restarts the schedule without a second end", () => {
    const f = fakeEnv();
    const refresh = vi.fn();
    const onEnd = vi.fn();
    const burst = createBurst({ env: f.env, refresh, onEnd });
    burst.start();
    f.advance(100_000);
    burst.start();
    expect(f.listeners()).toBe(1);
    f.advance(BURST_TOTAL_MS - 1_000);
    expect(burst.isRunning()).toBe(true);
    f.advance(1_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("bot working state", () => {
  it("starts on a wake, clears when the week content changes or the burst ends", () => {
    let s = { working: false, since: "a" };
    s = nextBotWorking(s, { type: "signature", signature: "b" });
    expect(s.working).toBe(false);
    s = nextBotWorking(s, { type: "wake", signature: "b" });
    expect(s.working).toBe(true);
    s = nextBotWorking(s, { type: "signature", signature: "b" });
    expect(s.working).toBe(true);
    s = nextBotWorking(s, { type: "signature", signature: "c" });
    expect(s.working).toBe(false);
    s = nextBotWorking(s, { type: "wake", signature: "c" });
    s = nextBotWorking(s, { type: "end" });
    expect(s.working).toBe(false);
  });

  it("shows the line right under the week and nothing otherwise", () => {
    expect(BOT_WORKING_LINE).toBe("Your bot is working on it.");
    const on = renderToStaticMarkup(createElement(WeekProcessingMark, { phase: "off", stretchKey: "k", announce: false, working: true }));
    expect(on).toContain('data-slot="bot-working"');
    expect(on).toContain(BOT_WORKING_LINE);
    expect(on).not.toContain("Still processing");
    const off = renderToStaticMarkup(createElement(WeekProcessingMark, { phase: "off", stretchKey: "k", announce: false }));
    expect(off).toBe("");
  });

  it("never wakes: the schedule module and the working hook only dispatch display events", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const schedule = readFileSync(path.join(root, "lib/wake-refresh-schedule.ts"), "utf8");
    expect(schedule).not.toMatch(/requestBotWake|fetch\(/);
    const provider = readFileSync(path.join(root, "components/supper-provider.tsx"), "utf8");
    expect(provider).toContain("createBurst");
    expect(provider).not.toMatch(/window\.setInterval\(\s*\(\) => \{\s*if \(Date\.now\(\) >= endsAt\)/);
  });
});
