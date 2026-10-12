import { weekQuery, type ViewedWeekSelection } from "./week-navigator";

/** NAV-TABS-WEEK-STRIP-LIST-SHARE-LOCK §1: Meals · List · House · Settings. No Recipes tab, no /meals alias. */
export type NavTabId = "meals" | "list" | "house" | "settings";

export type NavTabHref = "/week" | "/list" | "/house" | "/settings";

export const NAV_TABS: readonly { id: NavTabId; href: NavTabHref; label: string }[] = [
  { id: "meals", href: "/week", label: "Meals" },
  { id: "list", href: "/list", label: "List" },
  { id: "house", href: "/house", label: "House" },
  { id: "settings", href: "/settings", label: "Settings" },
];

export function navTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Meals and List carry the shared week in the link so switching tabs keeps it. */
export function navTabHref(href: string, selection: ViewedWeekSelection): string {
  if (href === "/week" || href === "/list") return `${href}${weekQuery(selection)}`;
  return href;
}
