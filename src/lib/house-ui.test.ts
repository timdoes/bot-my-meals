import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("House Clear Sky kit", () => {
  it("asks zip first on stores and always offers Add a store", () => {
    const source = readFileSync(path.join(srcRoot, "components/house-stores.tsx"), "utf8");
    expect(source).toContain("store-zip");
    expect(source).toContain("grocersForPostalCode");
    expect(source).toContain("Add a store");
    expect(source).not.toContain("places.googleapis");
    expect(source).not.toContain("GOOGLE_MAPS");
  });

  it("adds a custom store without a form submit that can leave the setup wizard", () => {
    const source = readFileSync(path.join(srcRoot, "components/house-stores.tsx"), "utf8");
    const wizard = readFileSync(path.join(srcRoot, "components/setup-wizard.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "app/week/page.tsx"), "utf8");

    expect(source).toContain("addCustomStore");
    expect(source).toContain("onAdd(grocer.slug, grocer.name)");
    expect(source).toContain("storeSlugForAdd(name)");
    expect(source).toContain('<Button type="button" size="fat" onClick={() => addCustomStore()}>');
    expect(source).toContain('if (event.key !== "Enter") return');
    expect(source).toContain("event.preventDefault()");
    expect(source).not.toContain("<form");
    expect(wizard).toContain('<div data-slot="setup-wizard"');
    expect(wizard).not.toContain("<form");
    expect(wizard).toContain("onAdd={(slug, name) => void addStore(slug, name)}");
    expect(wizard).not.toMatch(/onAdd=\{[^}]*advance/);
    expect(wizard).toContain("onClick={() =>");
    expect(wizard).toContain("void advance(");
    expect(week).toContain('searchParams.get("setup") === "1"');
    expect(week).toContain("SetupWizard");
  });

  it("uses card elevation, type ramp, and 48px steppers on people-per-night", () => {
    const source = readFileSync(path.join(srcRoot, "components/people-per-night.tsx"), "utf8");
    expect(source).toContain("HouseCard");
    expect(source).toContain("type-section");
    expect(source).toContain("size-12");
    expect(source).toContain("shadow-card");
    expect(source).not.toContain("Typical week");
    expect(source).not.toContain("plates-adjust");
    expect(source).not.toContain("<details");
    expect(source).not.toMatch(/\bAdjust\b/);
  });

  it("uses 48px member-row actions and kit type", () => {
    const source = readFileSync(path.join(srcRoot, "components/manage-people.tsx"), "utf8");
    expect(source).toContain("HouseCard");
    expect(source).toContain("type-section");
    expect(source).toContain('size="fat"');
    expect(source).not.toContain("h-11");
    expect(source).not.toContain("placeholder=");
  });

  it("keeps House primary actions fat; install and appearance live on Settings", () => {
    const source = readFileSync(path.join(srcRoot, "app/house/page.tsx"), "utf8");
    const settings = readFileSync(path.join(srcRoot, "app/settings/page.tsx"), "utf8");
    expect(source).not.toContain("InstallPrompt");
    expect(settings).toContain("AddToHomeRow");
    expect(source).toContain('size="fat"');
    expect(source).toContain("HouseCard");
    expect(source).not.toContain("AppearancePicker");
    expect(settings).toContain("AppearancePicker");
    expect(source).toContain("InviteShare");
    expect(source).toContain("HouseStores");
    expect(source).toContain("postalCode");
    expect(source).toContain("Weekly meal budget");
    expect(source).toContain("Finish house setup");
    expect(source).toContain("/week?setup=1");
    expect(source).not.toContain("Load sample week");
    expect(source).not.toContain("Load sample dinners");
    expect(source).not.toContain("seedDemoWeek");
  });
});

describe("Clear Sky House craft", () => {
  it("keeps steppers and member rows on Clear Sky cards, not Kitchen Paper", () => {
    const steppers = readFileSync(path.join(srcRoot, "components/people-per-night.tsx"), "utf8");
    const members = readFileSync(path.join(srcRoot, "components/manage-people.tsx"), "utf8");
    const card = readFileSync(path.join(srcRoot, "components/house-card.tsx"), "utf8");
    const house = readFileSync(path.join(srcRoot, "app/house/page.tsx"), "utf8");

    expect(card).toContain('data-slot="house-card"');
    expect(card).toContain("bg-card");
    expect(card).toContain("shadow-card");
    expect(steppers).toContain('data-slot="people-per-night"');
    expect(steppers).toContain('"night-stepper"');
    expect(steppers).toContain("nightKindLabel");
    expect(steppers).not.toContain("Typical week");
    expect(steppers).not.toContain("typical-stepper");
    expect(steppers).toContain("font-mono");
    expect(steppers).toContain("bg-secondary");
    expect(steppers).toContain("text-primary");
    expect(steppers).toContain("size-12");
    expect(members).toContain('data-slot="member-row"');
    expect(members).toContain('size="fat"');
    expect(members).toContain("rounded-[var(--radius-button)]");
    expect(house).not.toContain("InstallPrompt");
    expect(house).toContain('size="fat"');
    expect(steppers).not.toContain("#b35025");
    expect(steppers).not.toContain("Fraunces");
    expect(steppers).not.toContain("Clear Sky");
    expect(members).not.toContain("#b35025");
    expect(members).not.toContain("Fraunces");
    expect(members).not.toContain("Clear Sky");
    expect(members).not.toContain("Tim");
    expect(members).not.toContain("Rose");
  });
});

describe("PWA safe-area pass", () => {
  it("pads sticky header and nav with safe-area insets, not the body top", () => {
    const css = readFileSync(path.join(srcRoot, "app/globals.css"), "utf8");
    const shell = readFileSync(path.join(srcRoot, "components/app-shell.tsx"), "utf8");

    expect(css).toContain("padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left)");
    expect(css).not.toContain(
      "padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)",
    );
    expect(shell).toContain("pt-[env(safe-area-inset-top)]");
    expect(shell).toContain("pb-[max(0.5rem,env(safe-area-inset-bottom))]");
    expect(shell).toContain("pl-[env(safe-area-inset-left)]");
    expect(shell).toContain("pr-[env(safe-area-inset-right)]");
    expect(shell).toContain("pb-20");
    expect(shell).toContain("pb-36");
    expect(shell).toContain("hideNav");
    expect(shell).toContain("app-tabs");
    expect(shell).not.toContain("pb-32");
    expect(shell).not.toContain("pb-28");
    expect(shell).toContain("bg-card/95");
  });
});
