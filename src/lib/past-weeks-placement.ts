/**
 * Phone clearance for the This week "Past weeks" link.
 *
 * The lock footer is sticky at `3.75rem + safe-area` above the viewport bottom,
 * and main only keeps `pb-20` (5rem) when that footer is mounted. On a phone
 * the safe area eats that padding, so the link's bottom edge slides under the
 * lock bar. Extra padding under the link restores a gap above both the lock
 * footer and the fixed tab bar.
 */

export const WEEK_MAIN_FOOTER_PADDING_REM = 5;
export const WEEK_MAIN_NAV_PADDING_REM = 9;
export const LOCK_FOOTER_BOTTOM_REM = 3.75;
export const PAST_WEEKS_LINK_MIN_CLEARANCE_REM = 1;

/** Sticky lock footer: wrapper `py-2` + card `p-3` + fat button `h-12`. */
export const LOCK_FOOTER_PADDING_Y_REM = 0.5;
export const LOCK_CARD_PADDING_REM = 0.75;
export const LOCK_BUTTON_HEIGHT_REM = 3;

export const pastWeeksLinkPositionClass = `mt-6 pb-[max(${PAST_WEEKS_LINK_MIN_CLEARANCE_REM}rem,env(safe-area-inset-bottom))] text-center`;

export const pastWeeksLinkClass =
  "type-meta tap-target inline-flex items-center justify-center px-3 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4";

export type Box = { top: number; right: number; bottom: number; left: number };

export function boxesOverlap(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0;
}

function rem(rootFontPx: number, value: number): number {
  return value * rootFontPx;
}

export function pastWeeksLinkClearancePx(safeAreaBottomPx: number, rootFontPx = 16): number {
  return Math.max(rem(rootFontPx, PAST_WEEKS_LINK_MIN_CLEARANCE_REM), safeAreaBottomPx);
}

export function lockFooterHeightPx(rootFontPx = 16): number {
  return (
    rem(rootFontPx, LOCK_FOOTER_PADDING_Y_REM) * 2 +
    rem(rootFontPx, LOCK_CARD_PADDING_REM) * 2 +
    rem(rootFontPx, LOCK_BUTTON_HEIGHT_REM)
  );
}

export type WeekEndLayout = {
  link: Box;
  lock: Box | null;
  lockButton: Box | null;
  nav: Box;
};

/** Viewport boxes at max scroll, when the link has been brought as low as it can go. */
export function pastWeeksEndLayout(input: {
  viewportWidth: number;
  viewportHeight: number;
  safeAreaBottomPx: number;
  lockBarVisible: boolean;
  rootFontPx?: number;
  linkClearancePx?: number;
  linkHeightPx?: number;
  linkWidthPx?: number;
}): WeekEndLayout {
  const root = input.rootFontPx ?? 16;
  const safe = Math.max(0, input.safeAreaBottomPx);
  const linkHeight = input.linkHeightPx ?? 48;
  const linkWidth = input.linkWidthPx ?? Math.min(160, input.viewportWidth - 32);
  const clearance = input.linkClearancePx ?? pastWeeksLinkClearancePx(safe, root);
  const mainPad = rem(
    root,
    input.lockBarVisible ? WEEK_MAIN_FOOTER_PADDING_REM : WEEK_MAIN_NAV_PADDING_REM,
  );
  const stickyBottom = rem(root, LOCK_FOOTER_BOTTOM_REM) + safe;
  const lockHeight = input.lockBarVisible ? lockFooterHeightPx(root) : 0;
  const navHeight = rem(root, 0.25) + 48 + Math.max(rem(root, 0.5), safe);
  const viewportBottom = input.viewportHeight;

  const linkBottom = viewportBottom - lockHeight - mainPad - clearance;
  const linkLeft = (input.viewportWidth - linkWidth) / 2;
  const link: Box = {
    top: linkBottom - linkHeight,
    right: linkLeft + linkWidth,
    bottom: linkBottom,
    left: linkLeft,
  };

  const nav: Box = {
    top: viewportBottom - navHeight,
    right: input.viewportWidth,
    bottom: viewportBottom,
    left: 0,
  };

  if (!input.lockBarVisible) {
    return { link, lock: null, lockButton: null, nav };
  }

  const lockTop = viewportBottom - stickyBottom - lockHeight;
  const lock: Box = {
    top: lockTop,
    right: input.viewportWidth,
    bottom: viewportBottom - stickyBottom,
    left: 0,
  };
  const buttonInsetY = rem(root, LOCK_FOOTER_PADDING_Y_REM) + rem(root, LOCK_CARD_PADDING_REM);
  const buttonInsetX = rem(root, 1) + rem(root, LOCK_CARD_PADDING_REM);
  const lockButton: Box = {
    top: lock.top + buttonInsetY,
    right: input.viewportWidth - buttonInsetX,
    bottom: lock.top + buttonInsetY + rem(root, LOCK_BUTTON_HEIGHT_REM),
    left: buttonInsetX,
  };

  return { link, lock, lockButton, nav };
}

export function pastWeeksLinkCovered(layout: WeekEndLayout): boolean {
  const blockers = [layout.nav, layout.lock, layout.lockButton].filter((box): box is Box => box != null);
  return blockers.some((box) => boxesOverlap(layout.link, box));
}
