import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCK_FOOTER_BOTTOM_REM,
  WEEK_MAIN_FOOTER_PADDING_REM,
  WEEK_MAIN_NAV_PADDING_REM,
  pastWeeksEndLayout,
  PAST_WEEKS_LINK_MIN_CLEARANCE_REM,
  pastWeeksLinkClass,
  pastWeeksLinkCovered,
  pastWeeksLinkPositionClass,
} from "./past-weeks-placement";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("Past weeks link clearance", () => {
  it("matches the shell padding and the sticky lock footer offset", () => {
    const shell = readFileSync(path.join(srcRoot, "components/app-shell.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");

    expect(WEEK_MAIN_FOOTER_PADDING_REM).toBe(5);
    expect(WEEK_MAIN_NAV_PADDING_REM).toBe(9);
    expect(LOCK_FOOTER_BOTTOM_REM).toBe(3.75);
    expect(shell).toContain('footer ? "pb-20"');
    expect(shell).toContain('hideNav ? "pb-10" : "pb-36"');
    expect(shell).toContain("bottom-[calc(3.75rem+env(safe-area-inset-bottom))]");
    expect(shell).toContain('data-slot="app-tabs"');
    expect(shell).toContain("fixed inset-x-0 bottom-0");

    expect(week).toContain("pastWeeksLinkPositionClass");
    expect(week).toContain("pastWeeksLinkClass");
    expect(week).toContain('data-slot="past-weeks-link"');
    const placement = readFileSync(path.join(srcRoot, "lib/past-weeks-placement.ts"), "utf8");
    expect(placement).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
    expect(placement).not.toContain("pb-[max(${");
    expect(pastWeeksLinkPositionClass).toContain(
      `pb-[max(${PAST_WEEKS_LINK_MIN_CLEARANCE_REM}rem,env(safe-area-inset-bottom))]`,
    );
    expect(pastWeeksLinkClass).toContain("tap-target");
  });

  it("is not covered by the lock control or the bottom nav on a phone", () => {
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
            const layout = pastWeeksEndLayout({
              ...phone,
              safeAreaBottomPx,
              rootFontPx,
              lockBarVisible,
            });
            expect(pastWeeksLinkCovered(layout), JSON.stringify({ phone, safeAreaBottomPx, rootFontPx, lockBarVisible })).toBe(
              false,
            );
            expect(layout.link.bottom).toBeLessThanOrEqual(layout.nav.top);
            if (layout.lock && layout.lockButton) {
              expect(layout.link.bottom).toBeLessThanOrEqual(layout.lock.top);
              expect(layout.link.bottom).toBeLessThanOrEqual(layout.lockButton.top);
            }
          }
        }
      }
    }
  });

  it("is covered by the lock bar on a phone when the extra clearance is missing", () => {
    const layout = pastWeeksEndLayout({
      viewportWidth: 390,
      viewportHeight: 844,
      safeAreaBottomPx: 34,
      lockBarVisible: true,
      linkClearancePx: 0,
    });
    expect(pastWeeksLinkCovered(layout)).toBe(true);
    expect(layout.lock).not.toBeNull();
    expect(layout.link.bottom).toBeGreaterThan(layout.lock!.top);
  });
});
