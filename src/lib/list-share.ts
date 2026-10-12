/** HOUSE-SETTINGS-SPLIT §9 List Share. Device-agnostic copy, no prices. */
export const SHARE_LABEL = "Share";
export const SHARE_SHEET_TITLE = "Share list";
export const SHARE_TEXT_LABEL = "Send as text";
export const SHARE_TEXT_HELPER = "Opens your device's share options";
export const SHARE_IMAGE_LABEL = "Save as image";
export const SHARE_IMAGE_HELPER = "A picture of the list for your photos";
export const SHARE_PRINT_LABEL = "Print";
export const SHARE_PRINT_HELPER = "A clean, printer-friendly page";
export const SHARE_INCLUDE_CHECKED = "Include checked items";
export const SHARE_CANCEL = "Cancel";
export const LIST_COPIED_TOAST = "List copied.";
export const SHARE_FOOTER = "Bot My Meals";
export const LIST_TITLE = "Shopping list";
export const LIST_PAST_COPY = "Lists aren't kept for past weeks. Here's what you made.";

export type ShareItem = { name: string; quantity: string; checked: boolean };
export type ShareGroup = { store: string; items: ShareItem[] };

/** Unchecked rows only unless the switch is on. Empty stores drop out. */
export function filterShareGroups(groups: readonly ShareGroup[], includeChecked: boolean): ShareGroup[] {
  return groups
    .map((group) => ({
      store: group.store,
      items: includeChecked ? [...group.items] : group.items.filter((item) => !item.checked),
    }))
    .filter((group) => group.items.length > 0);
}

export function shareItemLine(item: ShareItem): string {
  const box = item.checked ? "☑" : "□";
  return item.quantity ? `${box} ${item.name} — ${item.quantity}` : `${box} ${item.name}`;
}

export function shareTitle(range: string): string {
  return `${LIST_TITLE} · ${range}`;
}

/** Plain text grouped by store (Send as text, and the clipboard fallback). */
export function shoppingListShareText(
  range: string,
  groups: readonly ShareGroup[],
  includeChecked: boolean,
): string {
  const visible = filterShareGroups(groups, includeChecked);
  const blocks = visible.map((group) => [group.store, ...group.items.map(shareItemLine)].join("\n"));
  return [shareTitle(range), ...blocks].join("\n\n");
}

export function shareItemCount(groups: readonly ShareGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

/** Print subline: `Oct 11 – 17 · 7 items`. */
export function printSubline(range: string, count: number): string {
  return `${range} · ${count === 1 ? "1 item" : `${count} items`}`;
}

/** List banner: `2 of 7 checked · whole week · 5 dinners`. */
export function listBannerLine(checked: number, total: number, dinners: number): string {
  return `${checked} of ${total} checked · whole week · ${dinners === 1 ? "1 dinner" : `${dinners} dinners`}`;
}

/** List eyebrow: `This week · Oct 11 – 17 · Locked`. */
export function listEyebrow(weekLabel: string, weekEyebrow: string): string {
  return [weekLabel, weekEyebrow].join(" · ");
}

/** Past week eyebrow (muted): `Past · Oct 4 – 10`. */
export function pastListEyebrow(range: string): string {
  return ["Past", range].join(" · ");
}

export function shareImageFilename(startsOn: string): string {
  return `shopping-list-${startsOn}.png`;
}
