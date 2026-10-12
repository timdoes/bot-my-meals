/** HOUSE-SETTINGS-SPLIT §4 exact strings. House = the household; Settings = you and this app. */
export const HOUSE_EYEBROW = "Household";
export const HOUSE_SECTION_FOOD = "Food";
export const HOUSE_SECTION_PEOPLE = "People";
export const HOUSE_SECTION_SHOPPING = "Shopping";

export const SETTINGS_EYEBROW = "You and this app";
export const SETTINGS_TITLE = "Settings";
export const SETTINGS_SECTION_ACCOUNT = "Account";
export const SETTINGS_SECTION_APP = "App";
export const SETTINGS_SECTION_BOT = "Your Bot";
export const SETTINGS_SECTION_HELP = "Help";
export const SETTINGS_APPEARANCE = "Appearance";
export const SETTINGS_INSTALL = "Add to Home Screen";
export const SETTINGS_INSTALL_SUB = "Open it like an app";
export const SETTINGS_HELP_FEEDBACK = "Help and feedback";
export const SETTINGS_VERSION = "Version";
export const SIGN_OUT_LABEL = "Sign out";
export const SIGNING_OUT_LABEL = "Signing out…";
export const WAKE_READ_ONLY_NOTE = "Only an Admin can change this.";
export const ADMIN_BADGE = "Admin";

/** `6 meals`; null when there are none. */
export function favoritesRowLine(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 meal" : `${count} meals`;
}

/** `Last: Oct 4 – 10`; null with no past weeks. */
export function pastWeeksRowLine(
  latestStartsOn: string | null,
  formatRange: (startsOn: string) => string,
): string | null {
  return latestStartsOn ? `Last: ${formatRange(latestStartsOn)}` : null;
}

/** Settings → Help → Help and feedback. Public repo: GitHub issues. */
export const HELP_FEEDBACK_URL = "https://github.com/timdoes/bot-my-meals/issues";

export function appVersionLabel(raw: string | undefined): string {
  return raw && raw.trim() ? raw.trim() : "dev";
}
