export const INSTALL_DISMISSED_KEY = "supper-install-dismissed";

export const INSTALL_IOS_COPY =
  "Add Bot My Meals to your Home Screen: tap Share, then Add to Home Screen.";

export const INSTALL_BROWSER_COPY =
  "Install from this browser: Add to Home Screen, or Install.";

export const INSTALL_PROMPT_COPY = "Install Bot My Meals for a Home Screen app.";

export function isStandaloneDisplay(
  matchMedia: ((query: string) => { matches: boolean }) | undefined,
  navigatorStandalone?: boolean,
): boolean {
  if (!matchMedia) return false;
  return matchMedia("(display-mode: standalone)").matches || navigatorStandalone === true;
}

export function isIosDevice(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent);
}

export function shouldHintIosInstall({
  standalone,
  dismissed,
  userAgent,
}: {
  standalone: boolean;
  dismissed: boolean;
  userAgent: string;
}): boolean {
  return !standalone && !dismissed && isIosDevice(userAgent);
}
