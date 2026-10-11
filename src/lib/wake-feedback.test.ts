import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyDayCard } from "@/components/empty-day-card";
import { MealsWaitingCard } from "@/components/post-lock-waiting";
import { BOT_WAKE_DEBOUNCE_MS } from "./bot-wake";
import { awaitingMealSlot } from "./ballot";
import type { Vote } from "./types";
import {
  AWAITING_MEAL_LABEL,
  PENDING_REFRESH_INTERVAL_MS,
  PENDING_REFRESH_WINDOW_MS,
  WAKE_ASKED_MESSAGE,
  WAKE_CHECK_HINT,
  WAKE_CHECKING_LABEL,
  WAKE_COOLDOWN_LABEL,
  WAKE_COOLDOWN_MS,
  WAKE_MEALS_NOTIFIED,
  WAKE_MEALS_PENDING_BODY,
  WAKE_MESSAGE_CONTINUE,
  WAKE_WAKING_LABEL,
  wakeControlLabel,
  wakeSettledPhase,
} from "./wake-feedback";

describe("wake feedback copy", () => {
  it("names the in-between states and keeps the cooldown on the wake debounce", () => {
    expect(WAKE_COOLDOWN_MS).toBe(BOT_WAKE_DEBOUNCE_MS);
    expect(WAKE_COOLDOWN_MS).toBeGreaterThanOrEqual(20_000);
    expect(WAKE_COOLDOWN_MS).toBeLessThanOrEqual(30_000);
    expect(PENDING_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(3_000);
    expect(PENDING_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(10_000);
    expect(PENDING_REFRESH_WINDOW_MS).toBeGreaterThanOrEqual(240_000);
    expect(PENDING_REFRESH_WINDOW_MS).toBeLessThanOrEqual(360_000);
    expect(wakeControlLabel("idle", "Check now", WAKE_CHECKING_LABEL)).toBe("Check now");
    expect(wakeControlLabel("waking", "Check now", WAKE_CHECKING_LABEL)).toBe("Checking\u2026");
    expect(wakeControlLabel("waking", "Get recipes now", WAKE_WAKING_LABEL)).toBe("Waking\u2026");
    expect(wakeControlLabel("cooldown", "Check now", WAKE_CHECKING_LABEL)).toBe(WAKE_COOLDOWN_LABEL);
    expect(wakeControlLabel("cooldown", "Check now", WAKE_CHECKING_LABEL)).not.toBe("Check now");
    expect(wakeSettledPhase("posted")).toBe("cooldown");
    expect(wakeSettledPhase("debounced")).toBe("cooldown");
    expect(wakeSettledPhase("failed")).toBe("idle");
    expect(wakeSettledPhase("unset")).toBe("idle");
    expect(wakeSettledPhase("skipped")).toBe("idle");
    expect(wakeSettledPhase(undefined)).toBe("idle");
    expect(WAKE_MEALS_NOTIFIED).toBe("Your bot was notified. Meals show up here when ready.");
    expect(WAKE_MEALS_PENDING_BODY).toBe(
      "Your Bot My Meals bot is working on this. Meals show up here when ready.",
    );
    expect(WAKE_CHECK_HINT).toBe("Wakes your bot. You\u2019ll see updates here when it\u2019s done.");
    expect(WAKE_MESSAGE_CONTINUE).toBe("Message your bot to continue");
    expect(WAKE_ASKED_MESSAGE).toBe("Asked you to message your bot");
    expect(AWAITING_MEAL_LABEL).toBe("Waiting for a meal\u2026");
    const voice = [WAKE_MEALS_NOTIFIED, WAKE_MEALS_PENDING_BODY, WAKE_CHECK_HINT, AWAITING_MEAL_LABEL]
      .join(" ")
      .toLowerCase();
    expect(voice).not.toContain("grandma");
    expect(voice).not.toContain("cart");
    expect(voice).not.toContain("$");
    expect(voice).not.toContain("no recipe was saved");
  });

  it("shows a waiting card for meals and a quiet placeholder on a blank slot", () => {
    const card = renderToStaticMarkup(
      createElement(MealsWaitingCard, {
        wakeConfigured: true,
        weekRole: "planning",
        startsOn: "2026-10-04",
        bothOpen: true,
      }),
    );
    expect(card).toContain("Waiting for your Bot");
    expect(card).toContain("Next week · Oct 4 – Oct 10");
    expect(card).toContain(WAKE_MEALS_PENDING_BODY);
    expect(card).toContain("Check now");
    expect(card).toContain(WAKE_CHECK_HINT);
    expect(card).not.toContain("Get recipes now");
    expect(card).not.toContain("Checks about every hour");
    expect(card).not.toContain("Checks every");
    expect(card).not.toContain("Next check");
    expect(card).not.toContain("Adaptive");
    expect(card).not.toContain("post-lock-cadence");

    const quiet = renderToStaticMarkup(
      createElement(MealsWaitingCard, {
        wakeConfigured: false,
      }),
    );
    expect(quiet).not.toContain("Checks about every hour");
    expect(quiet).not.toContain("Next check");
    expect(quiet).not.toContain("Adaptive");
    expect(quiet).toContain("This isn\u2019t a push from the app.");
    expect(quiet).not.toContain(WAKE_MEALS_NOTIFIED);

    const slot = renderToStaticMarkup(
      createElement(EmptyDayCard, {
        dayLabel: "Mon · Sep 28",
        dayName: "Monday",
        state: "awaiting",
      }),
    );
    expect(slot).toContain('data-slot="awaiting-meal"');
    expect(slot).toContain(AWAITING_MEAL_LABEL);
    expect(slot).not.toContain("No dinner");
    expect(slot).not.toContain("Add meal");
    expect(slot).not.toContain("No recipe was saved");

    const meal = { id: "mon", title: "" };
    const removed: Vote = {
      id: "v",
      householdId: "h",
      mealId: "mon",
      membershipId: "mem",
      choice: "remove",
      note: "",
      updatedAt: "2026-09-28T00:00:00.000Z",
    };
    expect(awaitingMealSlot(meal, [])).toBe(true);
    expect(awaitingMealSlot(meal, [removed])).toBe(false);
    expect(awaitingMealSlot({ id: "tue", title: "Tacos" }, [])).toBe(false);
  });

  it("wires save, check now, and the pending refresh without a new wake transport", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const week = readFileSync(path.join(root, "app/week/page.tsx"), "utf8");
    const provider = readFileSync(path.join(root, "components/supper-provider.tsx"), "utf8");
    const wake = readFileSync(path.join(root, "components/use-bot-wake.ts"), "utf8");
    const chrome = readFileSync(path.join(root, "components/week-chrome.tsx"), "utf8");

    expect(week).toContain("MealsWaitingCard");
    expect(week).toContain("awaitingMealSlot");
    expect(week).toContain("requestPendingRefresh");
    expect(week).toContain('data-slot="waiting-for-bot"');
    expect(chrome).not.toContain('data-slot="edit-nights"');
    expect(provider).toContain('requestBotWake("needs_work")');
    expect(provider).toContain("requestPendingRefresh");
    expect(provider).toContain("markBotWakeNotified");
    expect(provider).toContain("createBurst");
    expect(wake).toContain("WAKE_COOLDOWN_MS");
    expect(wake).toContain("BOT_WAKE_SOFT_FAIL");
    expect(wake).toContain('requestBotWake("check_now")');
    expect(wake).not.toMatch(/APNs|phone push/);
  });
});
