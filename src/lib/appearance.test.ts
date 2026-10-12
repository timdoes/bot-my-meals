import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPEARANCE_KEY } from "./config";
import {
  APPEARANCE_BOOTSTRAP_SCRIPT,
  canvasColor,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCE_OPTIONS,
  THEME_PREFERENCES,
} from "./appearance";
import { THEME_BACKGROUND, THEME_DARK_BACKGROUND } from "./theme";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("appearance preference", () => {
  it("defaults unknown values to Device and resolves against the scheme", () => {
    expect(THEME_PREFERENCES).toEqual(["device", "light", "dark"]);
    expect(parseThemePreference(undefined)).toBe("device");
    expect(parseThemePreference("nope")).toBe("device");
    expect(resolveTheme("device", false)).toBe("light");
    expect(resolveTheme("device", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(canvasColor("light")).toBe(THEME_BACKGROUND);
    expect(canvasColor("dark")).toBe(THEME_DARK_BACKGROUND);
  });

  it("bootstraps from the same storage key and canvas tokens", () => {
    expect(APPEARANCE_KEY).toBe("supper.appearance.v1");
    expect(APPEARANCE_BOOTSTRAP_SCRIPT).toContain(APPEARANCE_KEY);
    expect(APPEARANCE_BOOTSTRAP_SCRIPT).toContain(THEME_BACKGROUND);
    expect(APPEARANCE_BOOTSTRAP_SCRIPT).toContain(THEME_DARK_BACKGROUND);
    expect(APPEARANCE_BOOTSTRAP_SCRIPT).toContain("prefers-color-scheme: dark");
  });

  it("offers Device, Light, and Dark on Settings for the signed-in person", () => {
    const house = readFileSync(path.join(srcRoot, "app/settings/page.tsx"), "utf8");
    const picker = readFileSync(path.join(srcRoot, "components/appearance-picker.tsx"), "utf8");
    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const gate = readFileSync(path.join(srcRoot, "components/auth-gate.tsx"), "utf8");

    expect(house).toContain("AppearancePicker");
    expect(picker).toContain('data-slot="appearance-picker"');
    expect(picker).toContain('aria-label="Appearance"');
    expect(picker).toContain('role="radiogroup"');
    expect(THEME_PREFERENCE_OPTIONS.map((option) => option.label)).toEqual([
      "Device",
      "Light",
      "Dark",
    ]);
    expect(picker).toContain("data-appearance={option.value}");
    expect(picker).toContain("{option.label}");
    expect(picker).toContain("device:");
    expect(picker).toContain("light:");
    expect(picker).toContain("dark:");
    expect(picker).toContain("Follow this device, or keep Light or Dark.");
    expect(login).not.toContain("THEME_BACKGROUND");
    expect(gate).not.toContain("THEME_BACKGROUND");
  });
});
