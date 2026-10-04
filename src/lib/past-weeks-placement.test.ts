import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCK_FOOTER_BOTTOM_REM,
  STACK_MAIN_PADDING_REM,
  mealsCoveredByStack,
  pastWeeksCovered,
  pastWeeksStackLinkClass,
  weekBottomStackLayout,
} from "./past-weeks-placement";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("Past weeks bottom stack", () => {
  it("pins the row in the footer stack and keeps meal padding clear of that stack", () => {
    const shell = readFileSync(path.join(srcRoot, "components/app-shell.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");
    const placement = readFileSync(path.join(srcRoot, "lib/past-weeks-placement.ts"), "utf8");

    expect(STACK_MAIN_PADDING_REM).toBe(5);
    expect(LOCK_FOOTER_BOTTOM_REM).toBe(3.75);
    expect(shell).toMatch(
      /footer\s*\?\s*hideNav\s*\?\s*"pb-20"\s*:\s*"pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]"/,
    );
    expect(shell).toContain("bottom-[calc(3.75rem+env(safe-area-inset-bottom))]");
    expect(shell).toContain('data-slot="app-tabs"');
    expect(shell).toContain("fixed inset-x-0 bottom-0");

    expect(week).toContain("const showPastWeeks = snapshot.mealHistory.length > 0");
    expect(week).toContain(
      "const showLockBar = !viewingPast && !locked && check.ready && !showPeopleGate",
    );
    expect(week).toContain('data-slot="week-bottom-stack"');
    expect(week).toContain("{showPastWeeks ? (");
    expect(week).toContain("{showLockBar ? <LockBar /> : null}");
    expect(week).toContain('data-slot="past-weeks-link"');
    expect(week).toContain('href="/settings/history"');
    expect(week.indexOf('data-slot="past-weeks-link"')).toBeLessThan(week.indexOf("<InstallPrompt />"));
    expect(week.indexOf('data-slot="past-weeks-link"')).toBeLessThan(
      week.indexOf("{showLockBar ? <LockBar /> : null}"),
    );
    expect(pastWeeksStackLinkClass).toContain("w-full");
    expect(pastWeeksStackLinkClass).toContain("min-h-12");
    expect(placement).toContain(pastWeeksStackLinkClass);
    expect(placement).not.toContain("pb-[max(${");
  });

  it("keeps the whole row visible above the lock button and the tab bar, and above the nav alone", () => {
    const phones = [
      { viewportWidth: 320, viewportHeight: 568 },
      { viewportWidth: 375, viewportHeight: 667 },
      { viewportWidth: 390, viewportHeight: 844 },
      { viewportWidth: 430, viewportHeight: 932 },
    ];
    const safeAreas = [0, 21, 34, 47];
    const rootFonts = [16, 20];

    for (const phone of phones) {
      for (const safeAreaBottomPx of safeAreas) {
        for (const rootFontPx of rootFonts) {
          for (const lockBarVisible of [true, false]) {
            const layout = weekBottomStackLayout({
              ...phone,
              safeAreaBottomPx,
              rootFontPx,
              lockBarVisible,
            });
            const where = JSON.stringify({ phone, safeAreaBottomPx, rootFontPx, lockBarVisible });
            expect(layout.pastWeeks, where).not.toBeNull();
            expect(pastWeeksCovered(layout), where).toBe(false);
            expect(mealsCoveredByStack(layout), where).toBe(false);
            const row = layout.pastWeeks!;
            expect(row.left, where).toBe(layout.meals.left);
            expect(row.right, where).toBe(layout.meals.right);
            expect(row.bottom, where).toBeLessThanOrEqual(layout.nav.top);
            expect(row.top, where).toBeGreaterThanOrEqual(layout.stack.top);
            expect(row.bottom, where).toBeLessThanOrEqual(layout.stack.bottom);
            expect(layout.meals.bottom, where).toBeLessThanOrEqual(layout.stack.top);
            if (layout.lock && layout.lockButton) {
              expect(row.bottom, where).toBeLessThanOrEqual(layout.lock.top);
              expect(row.bottom, where).toBeLessThanOrEqual(layout.lockButton.top);
            }
          }
        }
      }
    }
  });

  it("lets the last meal card slide under the stack when safe-area padding is missing", () => {
    const layout = weekBottomStackLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      safeAreaBottomPx: 34,
      lockBarVisible: true,
      includeSafeAreaInMainPad: false,
    });
    expect(mealsCoveredByStack(layout)).toBe(true);
    expect(pastWeeksCovered(layout)).toBe(false);
  });
});
