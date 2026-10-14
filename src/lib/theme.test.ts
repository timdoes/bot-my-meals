import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChromeBackLink } from "@/components/chrome-back";
import { PRODUCT_TAGLINE } from "./config";
import { contrastRatio, WCAG_AA_NORMAL } from "./contrast";
import {
  BRAND_FAVICON_SRC,
  BRAND_ICON_180_SRC,
  BRAND_ICON_192_SRC,
  BRAND_ICON_512_SRC,
  BRAND_MARK_SRC,
  BRAND_SPEC_SHA256,
  RETIRED_BLUE_ROBOT_SHA256,
  THEME_BACKGROUND,
  THEME_CARD,
  THEME_FOREGROUND,
  THEME_MUTED_FOREGROUND,
  THEME_PRIMARY,
  THEME_DARK_BACKGROUND,
  THEME_DARK_CARD,
  THEME_DARK_FOREGROUND,
  THEME_DARK_MUTED_FOREGROUND,
  THEME_DARK_TOKENS,
  THEME_SWAP,
  THEME_SWAP_FOREGROUND,
  THEME_TOKENS,
} from "./theme";
import { sourceBetween } from "./test-source";

const srcRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(srcRoot, "..");

describe("theme D Clear Sky brand tokens", () => {
  it("uses the canonical primary and background hexes", () => {
    expect(THEME_PRIMARY).toBe("#2563eb");
    expect(THEME_BACKGROUND).toBe("#f5f8fc");
  });

  it("keeps the product tagline exact", () => {
    expect(PRODUCT_TAGLINE).toBe("This week's dinners, agreed.");
  });

  it("keeps CSS variables, theme-color, and the manifest on the same tokens", () => {
    const css = readFileSync(path.join(srcRoot, "app/globals.css"), "utf8");
    const layout = readFileSync(path.join(srcRoot, "app/layout.tsx"), "utf8");
    const manifest = readFileSync(path.join(srcRoot, "app/manifest.ts"), "utf8");

    for (const [name, hex] of Object.entries(THEME_TOKENS)) {
      expect(css).toContain(`--${name}: ${hex}`);
    }
    expect(layout).toContain("themeColor: THEME_PRIMARY");
    expect(layout).not.toContain("maximumScale");
    expect(layout).toContain("ThemeProvider");
    expect(layout).toContain("APPEARANCE_BOOTSTRAP_SCRIPT");
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).not.toContain("THEME_BACKGROUND");
    expect(manifest).toContain("background_color: THEME_BACKGROUND");
    expect(manifest).toContain("theme_color: THEME_PRIMARY");
  });

  it("keeps dark CSS variables on the dark counterpart tokens", () => {
    const css = readFileSync(path.join(srcRoot, "app/globals.css"), "utf8");
    expect(css).toContain(".dark {");
    expect(css).toContain("html.dark {");
    expect(css).toContain("color-scheme: dark");
    for (const [name, hex] of Object.entries(THEME_DARK_TOKENS)) {
      expect(css).toContain(`--${name}: ${hex}`);
    }
  });

  it("gates muted-foreground contrast on canvas vs card (document exact ratios)", () => {
    const mutedOnCanvas = contrastRatio(THEME_MUTED_FOREGROUND, THEME_BACKGROUND);
    const mutedOnCard = contrastRatio(THEME_MUTED_FOREGROUND, THEME_CARD);
    const swapOnFill = contrastRatio(THEME_SWAP_FOREGROUND, THEME_SWAP);

    expect(mutedOnCanvas).toBeCloseTo(4.47, 2);
    expect(mutedOnCanvas).toBeLessThan(WCAG_AA_NORMAL);
    expect(mutedOnCard).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(swapOnFill).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it("inverts Clear Sky canvas/ink for dark and keeps brand fills", () => {
    expect(THEME_DARK_BACKGROUND).toBe(THEME_FOREGROUND);
    expect(THEME_DARK_FOREGROUND).toBe(THEME_BACKGROUND);
    expect(THEME_DARK_TOKENS.primary).toBe(THEME_PRIMARY);
    expect(THEME_DARK_TOKENS.approve).toBe(THEME_TOKENS.approve);
    expect(THEME_DARK_TOKENS.swap).toBe(THEME_TOKENS.swap);
    expect(THEME_DARK_TOKENS.destructive).toBe(THEME_TOKENS.destructive);

    const mutedOnCanvas = contrastRatio(THEME_DARK_MUTED_FOREGROUND, THEME_DARK_BACKGROUND);
    const mutedOnCard = contrastRatio(THEME_DARK_MUTED_FOREGROUND, THEME_DARK_CARD);
    const inkOnCanvas = contrastRatio(THEME_DARK_FOREGROUND, THEME_DARK_BACKGROUND);
    expect(mutedOnCanvas).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(mutedOnCard).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(inkOnCanvas).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it("drops Kitchen Paper terracotta and Fraunces / Fredoka", () => {
    const css = readFileSync(path.join(srcRoot, "app/globals.css"), "utf8");
    const layout = readFileSync(path.join(srcRoot, "app/layout.tsx"), "utf8");
    const theme = readFileSync(path.join(srcRoot, "lib/theme.ts"), "utf8");

    for (const hex of ["#b35025", "#f7f1e6", "#fbf4e8"]) {
      expect(css).not.toContain(hex);
      expect(theme).not.toContain(hex);
    }
    expect(layout).not.toContain("Fraunces");
    expect(layout).not.toContain("Fredoka");
    expect(css).not.toContain("Fraunces");
    expect(css).not.toContain("Fredoka");
    expect(css).not.toContain("ui-serif");
    expect(layout).toContain("Nunito_Sans");
    expect(css).toContain("--font-heading: var(--font-nunito)");
  });

  it("points BrandMark and PWA icons at the Cos chef SoT", () => {
    const brandMark = readFileSync(path.join(srcRoot, "components/brand-mark.tsx"), "utf8");
    const layout = readFileSync(path.join(srcRoot, "app/layout.tsx"), "utf8");
    const pwa = readFileSync(path.join(repoRoot, "scripts/write-pwa-icons.mjs"), "utf8");

    expect(BRAND_MARK_SRC).toBe("/brand/mark-chef-bot-only.png");
    expect(BRAND_ICON_180_SRC).toBe("/brand/icon-chef-bot-only-180.png");
    expect(BRAND_ICON_192_SRC).toBe("/brand/icon-chef-bot-only-192.png");
    expect(BRAND_ICON_512_SRC).toBe("/brand/icon-chef-bot-only-512.png");
    expect(BRAND_FAVICON_SRC).toBe("/favicon.ico");
    expect(brandMark).toContain("BRAND_MARK_SRC");
    expect(brandMark).toContain("<img");
    expect(brandMark).toContain("font-heading");
    expect(brandMark).toContain("text-primary");
    expect(brandMark).toContain("text-approve");
    expect(brandMark).toContain(">Bot<");
    expect(brandMark).toContain("My Meals");
    expect(brandMark).not.toContain("tim-locked-brandmark");
    expect(brandMark).not.toContain("bg-white");
    expect(brandMark).not.toContain("bg-card");
    expect(layout).toContain("BRAND_ICON_192_SRC");
    expect(layout).toContain("BRAND_ICON_180_SRC");
    expect(layout).toContain("BRAND_FAVICON_SRC");
    expect(layout).not.toContain("BRAND_ICON_NATIVE_SRC");
    expect(pwa).toContain("icon-chef-bot-only-192.png");
    expect(pwa).toContain("icon-chef-bot-only-512.png");
    expect(pwa).toContain("icon-chef-bot-only-180.png");
    expect(pwa).toContain("src/app/favicon.ico");
    expect(pwa).not.toContain("icon-tim-locked");
    expect(pwa).not.toContain("TERRACOTTA");
    expect(pwa).not.toContain("unlinkSync");

    const shell = readFileSync(path.join(srcRoot, "components/app-shell.tsx"), "utf8");
    expect(shell).toContain("BrandMark");
    expect(shell).toContain('size="compact"');
    const header = sourceBetween(shell, "<header", "</header>");
    expect(header).toContain('data-slot="app-header"');
    expect(header).toContain('<BrandMark size="compact" />');
    expect(header.indexOf("<BrandMark")).toBeLessThan(header.indexOf("{backHref"));
    expect(header).toContain("<ChromeBackLink");
    expect(header).toContain("label={backLabel}");
    expect(header).toContain('backHref ? "text-muted-foreground" : "mt-3 text-primary"');
    expect(header).not.toContain("←");
    expect(header).not.toMatch(/backHref \? \([\s\S]*\) : \(\s*<BrandMark/);
    expect(contrastRatio(THEME_FOREGROUND, THEME_CARD)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(THEME_DARK_FOREGROUND, THEME_DARK_CARD)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);

    const markup = renderToStaticMarkup(
      createElement(ChromeBackLink, { href: "/week", label: "This week" }),
    );
    expect(markup).toContain('data-slot="chrome-back"');
    expect(markup).toContain('href="/week"');
    expect(markup).toContain("This week");
    expect(markup).toContain("<svg");
    expect(markup).not.toContain("←");

    const back = readFileSync(path.join(srcRoot, "components/chrome-back.tsx"), "utf8");
    expect(back).toContain("ChevronLeft");
    expect(back).toContain('data-slot="chrome-back"');
    expect(back).toContain("min-h-11");
    expect(back).toContain("min-w-11");
    expect(back).toContain("size-5");
    expect(back).toContain("text-[16px]");
    expect(back).toContain("font-semibold");
    expect(back).toContain("text-foreground");
    expect(back).toContain("mt-2");
    expect(back).toContain("mb-4");
    expect(back).toContain("py-3");
    expect(back).toContain("dark:bg-[rgba(255,255,255,0.08)]");
    expect(back).toContain("{label}");
    expect(back).not.toContain("←");
    expect(back).not.toContain("text-primary");
    expect(back).not.toContain("type-meta");
    expect(back).not.toContain("Back to This week");
    expect(shell).toContain('backLabel = "This week"');
    expect(shell).not.toContain('backLabel = "Back"');

    for (const label of ["This week", "Recipes", "Past weeks", "House"]) {
      const swapped = renderToStaticMarkup(createElement(ChromeBackLink, { href: "/week", label }));
      expect(swapped).toContain(label);
      expect(swapped).toContain("<svg");
      expect(swapped).not.toContain("←");
      expect(swapped).not.toContain("Back to");
    }

    const manifest = readFileSync(path.join(srcRoot, "app/manifest.ts"), "utf8");
    expect(manifest).toContain("BRAND_ICON_192_SRC");
    expect(manifest).toContain("BRAND_ICON_512_SRC");
    expect(manifest).not.toContain("tim-locked");
    expect(layout).not.toContain("tim-locked");
  });

  it("ships the Cos chef SoT bytes (exact sha256)", () => {
    const files: Array<[string, string]> = [
      ["public/brand/mark-chef-bot-only.png", BRAND_SPEC_SHA256.mark],
      ["public/brand/icon-chef-bot-only-180.png", BRAND_SPEC_SHA256.icon180],
      ["public/brand/icon-chef-bot-only-192.png", BRAND_SPEC_SHA256.icon192],
      ["public/brand/icon-chef-bot-only-512.png", BRAND_SPEC_SHA256.icon512],
    ];
    for (const [rel, digest] of files) {
      const abs = path.join(repoRoot, rel);
      expect(existsSync(abs), rel).toBe(true);
      const bytes = readFileSync(abs);
      expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
      expect(createHash("sha256").update(bytes).digest("hex"), rel).toBe(digest);
    }
    expect(readdirSync(path.join(repoRoot, "public/brand")).sort()).toEqual([
      "icon-chef-bot-only-180.png",
      "icon-chef-bot-only-192.png",
      "icon-chef-bot-only-512.png",
      "mark-chef-bot-only.png",
    ]);

    const retiredNames = [
      "public/brand/icon-chef-bot-tim-192.png",
      "public/brand/icon-chef-bot-tim-512.png",
      "public/brand/icon-tim-locked-192.png",
      "public/brand/icon-tim-locked-512.png",
      "public/brand/icon-tim-locked-native.png",
      "public/brand/tim-locked-brandmark.png",
      "public/brand/tim-locked-brandmark-header.png",
    ];
    for (const rel of retiredNames) {
      expect(existsSync(path.join(repoRoot, rel)), rel).toBe(false);
    }

    const favicon = readFileSync(path.join(repoRoot, "src/app/favicon.ico"));
    const publicFavicon = readFileSync(path.join(repoRoot, "public/favicon.ico"));
    const appleTouch = readFileSync(path.join(repoRoot, "public/apple-touch-icon.png"));
    const appIcon = readFileSync(path.join(repoRoot, "src/app/icon.png"));
    expect(favicon.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))).toBe(true);
    expect(createHash("sha256").update(favicon).digest("hex")).toBe(BRAND_SPEC_SHA256.favicon);
    expect(createHash("sha256").update(publicFavicon).digest("hex")).toBe(BRAND_SPEC_SHA256.favicon);
    expect(createHash("sha256").update(appleTouch).digest("hex")).toBe(BRAND_SPEC_SHA256.icon180);
    expect(createHash("sha256").update(appIcon).digest("hex")).toBe(BRAND_SPEC_SHA256.icon192);

    const iconRoots = [path.join(repoRoot, "public"), path.join(repoRoot, "src/app")];
    const walkIcons = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (statSync(abs).isDirectory()) {
          walkIcons(abs);
          continue;
        }
        if (!/\.(png|ico)$/i.test(name)) continue;
        const digest = createHash("sha256").update(readFileSync(abs)).digest("hex");
        expect(RETIRED_BLUE_ROBOT_SHA256, abs).not.toContain(digest);
      }
    };
    for (const root of iconRoots) walkIcons(root);
  });

  it("uses the shared This week header on signed-in product screens", () => {
    const screens = [
      "app/week/page.tsx",
      "app/week/recipes/page.tsx",
      "app/list/page.tsx",
      "app/settings/page.tsx",
      "app/house/page.tsx",
      "app/house/past-weeks/page.tsx",
      "app/house/past-weeks/[startsOn]/page.tsx",
      "app/week/[mealId]/page.tsx",
      "components/setup-wizard.tsx",
      "components/onboarding.tsx",
    ];
    for (const rel of screens) {
      const source = readFileSync(path.join(srcRoot, rel), "utf8");
      expect(source, rel).toContain("<AppShell");
      expect(source, rel).not.toContain("mark-chef");
      expect(source, rel).not.toContain("<img");
    }
  });

  it("does not ship Clear Sky / Blue & White theme pills in product UI", () => {
    const uiRoots = [path.join(srcRoot, "app"), path.join(srcRoot, "components")];
    const forbidden = ["Clear Sky", "Blue & White", "Blue and White"];
    for (const root of uiRoots) {
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const abs = path.join(dir, name);
          if (statSync(abs).isDirectory()) {
            walk(abs);
            continue;
          }
          if (!name.endsWith(".tsx")) continue;
          const source = readFileSync(abs, "utf8");
          for (const label of forbidden) {
            expect(source, abs).not.toContain(label);
          }
        }
      };
      walk(root);
    }
  });
});
