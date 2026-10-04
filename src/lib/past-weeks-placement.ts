/**
 * This week bottom stack.
 *
 * Past weeks is a full-width row in the sticky footer, above Lock this week
 * when that button is showing and above the tab bar when it is not. It does
 * not sit in the meal scroll. Main padding is `5rem + safe-area` while the
 * nav is showing so the sticky offset (`3.75rem + safe-area`) cannot cover
 * the last meal card.
 */

export const STACK_MAIN_PADDING_REM = 5;
export const LOCK_FOOTER_BOTTOM_REM = 3.75;
export const STACK_PAD_Y_REM = 0.5;
export const STACK_GAP_REM = 0.5;
export const STACK_INLINE_PAD_REM = 1;
export const PAST_WEEKS_ROW_HEIGHT_REM = 3;

/** Lock card: `p-3` around a fat `h-12` button. Shell `py-2` is the stack pad. */
export const LOCK_CARD_PADDING_REM = 0.75;
export const LOCK_BUTTON_HEIGHT_REM = 3;

export const pastWeeksStackLinkClass =
  "type-body flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] bg-card px-5 text-foreground shadow-card";

export type Box = { top: number; right: number; bottom: number; left: number };

export function boxesOverlap(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0;
}

function rem(rootFontPx: number, value: number): number {
  return value * rootFontPx;
}

export function lockCardHeightPx(rootFontPx = 16): number {
  return rem(rootFontPx, LOCK_CARD_PADDING_REM) * 2 + rem(rootFontPx, LOCK_BUTTON_HEIGHT_REM);
}

export type WeekBottomStackLayout = {
  meals: Box;
  stack: Box;
  pastWeeks: Box | null;
  lock: Box | null;
  lockButton: Box | null;
  nav: Box;
};

/** Viewport boxes at max scroll. Past weeks lives in the sticky stack, not in the meal list. */
export function weekBottomStackLayout(input: {
  viewportWidth: number;
  viewportHeight: number;
  safeAreaBottomPx: number;
  lockBarVisible: boolean;
  pastWeeksVisible?: boolean;
  rootFontPx?: number;
  /** Phone home-indicator inset on the meal padding. Off, the last card slides under the stack. */
  includeSafeAreaInMainPad?: boolean;
}): WeekBottomStackLayout {
  const root = input.rootFontPx ?? 16;
  const safe = Math.max(0, input.safeAreaBottomPx);
  const pastWeeksVisible = input.pastWeeksVisible ?? true;
  const includeSafe = input.includeSafeAreaInMainPad ?? true;
  const stickyBottom = rem(root, LOCK_FOOTER_BOTTOM_REM) + safe;
  const mainPad = rem(root, STACK_MAIN_PADDING_REM) + (includeSafe ? safe : 0);
  const padY = rem(root, STACK_PAD_Y_REM);
  const gap = pastWeeksVisible && input.lockBarVisible ? rem(root, STACK_GAP_REM) : 0;
  const rowHeight = pastWeeksVisible ? rem(root, PAST_WEEKS_ROW_HEIGHT_REM) : 0;
  const lockHeight = input.lockBarVisible ? lockCardHeightPx(root) : 0;
  const footerHeight = padY * 2 + rowHeight + gap + lockHeight;
  const navHeight = rem(root, 0.25) + 48 + Math.max(rem(root, 0.5), safe);
  const inlinePad = rem(root, STACK_INLINE_PAD_REM);
  const viewportBottom = input.viewportHeight;

  const stack: Box = {
    top: viewportBottom - stickyBottom - footerHeight,
    right: input.viewportWidth,
    bottom: viewportBottom - stickyBottom,
    left: 0,
  };
  const nav: Box = {
    top: viewportBottom - navHeight,
    right: input.viewportWidth,
    bottom: viewportBottom,
    left: 0,
  };
  const meals: Box = {
    top: stack.top - mainPad - rem(root, 4),
    right: input.viewportWidth - inlinePad,
    bottom: viewportBottom - footerHeight - mainPad,
    left: inlinePad,
  };

  const contentLeft = inlinePad;
  const contentRight = input.viewportWidth - inlinePad;
  const pastWeeks: Box | null = pastWeeksVisible
    ? {
        top: stack.top + padY,
        right: contentRight,
        bottom: stack.top + padY + rowHeight,
        left: contentLeft,
      }
    : null;

  if (!input.lockBarVisible || !pastWeeks) {
    const lockOnly: Box | null =
      input.lockBarVisible
        ? {
            top: stack.top + padY,
            right: contentRight,
            bottom: stack.top + padY + lockHeight,
            left: contentLeft,
          }
        : null;
    return {
      meals,
      stack,
      pastWeeks,
      lock: lockOnly,
      lockButton: lockOnly ? lockButtonBox(lockOnly, root) : null,
      nav,
    };
  }

  const lock: Box = {
    top: pastWeeks.bottom + gap,
    right: contentRight,
    bottom: pastWeeks.bottom + gap + lockHeight,
    left: contentLeft,
  };
  return { meals, stack, pastWeeks, lock, lockButton: lockButtonBox(lock, root), nav };
}

function lockButtonBox(lock: Box, rootFontPx: number): Box {
  const inset = rem(rootFontPx, LOCK_CARD_PADDING_REM);
  return {
    top: lock.top + inset,
    right: lock.right - inset,
    bottom: lock.top + inset + rem(rootFontPx, LOCK_BUTTON_HEIGHT_REM),
    left: lock.left + inset,
  };
}

export function pastWeeksCovered(layout: WeekBottomStackLayout): boolean {
  if (!layout.pastWeeks) return false;
  const blockers = [layout.nav, layout.lock, layout.lockButton].filter((box): box is Box => box != null);
  return blockers.some((box) => boxesOverlap(layout.pastWeeks!, box));
}

export function mealsCoveredByStack(layout: WeekBottomStackLayout): boolean {
  const blockers = [layout.stack, layout.nav, layout.lock, layout.lockButton, layout.pastWeeks].filter(
    (box): box is Box => box != null,
  );
  return blockers.some((box) => boxesOverlap(layout.meals, box));
}
