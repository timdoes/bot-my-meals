import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grokPromptPaste } from "./install-docs";
import {
  BACKEND_SETUP_CTA,
  BACKEND_SETUP_HELPER,
  BACKEND_SETUP_STEPS,
  BACKEND_SETUP_TITLE,
  SETUP_HELPER,
  SETUP_TITLE,
  backendSetupStatusMessage,
  shouldOpenBackendChecklist,
} from "./setup";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("first-run setup copy", () => {
  it("keeps the critique title and soft helper", () => {
    expect(SETUP_TITLE).toBe("Set up this house");
    expect(SETUP_HELPER).toBe(
      "Seven short steps. Invite people first — then how many people, which nights, stores, budget, and create meals.",
    );
  });
});

describe("backend setup gate copy", () => {
  it("asks for a real host and database, not a device-only household", () => {
    expect(BACKEND_SETUP_TITLE).toBe("Set up the real house");
    expect(BACKEND_SETUP_HELPER).toMatch(/will not keep dinners only on this device/i);
    expect(BACKEND_SETUP_HELPER).toMatch(/Cloudflare/);
    expect(BACKEND_SETUP_HELPER).toMatch(/Supabase/);
    expect(BACKEND_SETUP_CTA).toBe("Continue setup");
    expect(BACKEND_SETUP_STEPS.map((step) => step.id)).toEqual([
      "worker",
      "supabase",
      "migrations",
      "keys",
      "homescreen",
    ]);
    expect(BACKEND_SETUP_STEPS[0].body).toMatch(/bot-my-meals/);
    expect(BACKEND_SETUP_STEPS[0].body).toMatch(/workers\.dev/);
    expect(BACKEND_SETUP_STEPS[0].body).toMatch(/\{handle\}\.botmymeals\.com/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/Site URL/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/auth\/callback/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/Confirm email OFF/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/email and password/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/not a magic link/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/Optional later: custom SMTP/);
    expect(BACKEND_SETUP_STEPS[1].body).toMatch(/\{\{ \.Token \}\}/);
    expect(BACKEND_SETUP_STEPS[1].body).not.toMatch(/Add custom SMTP/);
    expect(BACKEND_SETUP_STEPS[1].body).not.toMatch(/Email OTP/);
    expect(BACKEND_SETUP_STEPS[1].body).not.toMatch(/grandma/i);
    expect(BACKEND_SETUP_STEPS[2].body).toMatch(/Row Level Security/);
    expect(BACKEND_SETUP_STEPS[2].body).toMatch(/supabase\/migrations/);
    expect(BACKEND_SETUP_STEPS[4].body).toMatch(/Install it from this browser/);
  });

  it("opens the checklist for partial or invalid env, and after Continue setup", () => {
    expect(shouldOpenBackendChecklist("missing", false)).toBe(false);
    expect(shouldOpenBackendChecklist("missing", true)).toBe(true);
    expect(shouldOpenBackendChecklist("partial", false)).toBe(true);
    expect(shouldOpenBackendChecklist("invalid", false)).toBe(true);
    expect(shouldOpenBackendChecklist("ready", false)).toBe(false);
    expect(backendSetupStatusMessage("missing")).toMatch(/Continue setup/);
    expect(backendSetupStatusMessage("partial")).toMatch(/missing/);
    expect(backendSetupStatusMessage("invalid")).toMatch(/anon public key/);
    expect(backendSetupStatusMessage("ready")).toBeNull();
  });
});

describe("setup surfaces", () => {
  it("aliases /setup to the same LoginHome UI as / and /login", () => {
    const setupPage = readFileSync(path.join(srcRoot, "app/setup/page.tsx"), "utf8");
    const homePage = readFileSync(path.join(srcRoot, "app/page.tsx"), "utf8");
    const loginPage = readFileSync(path.join(srcRoot, "app/login/page.tsx"), "utf8");

    expect(setupPage).toContain("LoginHome");
    expect(homePage).toContain("LoginHome");
    expect(loginPage).toContain("LoginHome");
  });

  it("keeps the household-wizard CTA fat and walks seven post-create steps", () => {
    const wizard = readFileSync(path.join(srcRoot, "components/setup-wizard.tsx"), "utf8");

    expect(wizard).toContain("SETUP_TITLE");
    expect(wizard).toContain("InviteShare");
    expect(wizard).toContain("PeoplePerNight");
    expect(wizard).toContain("HouseStores");
    expect(wizard).not.toContain("<form");
    expect(wizard).toContain("weekly-budget");
    expect(wizard).toContain('size="fat"');
    expect(wizard).toContain('data-slot="setup-cta"');
    expect(wizard).toContain("CREATE_MEALS_CTA");
    expect(wizard).toContain("DIY_GROK_PASTE_CTA");
    expect(wizard).toContain("household-size");
    expect(wizard).toContain("NightToggles");
    expect(wizard).not.toContain("placeholder=");
    expect(wizard).not.toContain("loadSampleWeek");
    expect(wizard).not.toContain("SAMPLE_WEEK");
    expect(wizard).not.toContain("Load sample dinners");
    expect(wizard).not.toContain("Checkbox");
    expect(wizard).not.toContain("setup-sample");
    expect(wizard).not.toContain("ASK_BOT_SEVEN_DINNERS_CTA");
  });

  it("documents the setup gate instead of a localStorage demo", () => {
    const readme = readFileSync(path.join(srcRoot, "../README.md"), "utf8");
    expect(readme).toMatch(/setup gate/);
    expect(readme).not.toMatch(/runs demo\/localStorage mode/);
    expect(readme).not.toMatch(/leave the values blank for demo mode/);
    expect(readme).toMatch(/bot-my-meals/);
    expect(readme).toMatch(/bot-my-meals\.<your-subdomain>\.workers\.dev/);
    expect(readme).not.toMatch(/timdoes\.botmymeals\.com/);
    expect(readme).toMatch(/docs\/domains\.md/);
    expect(readme).not.toMatch(/Load sample week/);
    expect(readme).not.toMatch(/Seed this week/);
    expect(readme).toMatch(/https:\/\/<host>\/join\/<token>/);
    expect(readme).toMatch(/https:\/\/<our-host>\/join\/<token>/);
    expect(readme).toMatch(/invite links only/);
    expect(readme).not.toMatch(/invite code/i);
    expect(readme).not.toMatch(/and\/or invite/);
    expect(readme).not.toMatch(/paste-code/);
    expect(readme).toMatch(/via share sheet/);
    expect(readme).toMatch(/Confirm email OFF/);
    expect(readme).toMatch(/email \+ password/);
    expect(readme).toMatch(/Create account/);
    expect(readme).toMatch(/not a magic link/);
    expect(readme).toMatch(/Optional later: custom SMTP/);
    expect(readme).toMatch(/\{\{ \.Token \}\}/);
    expect(readme).not.toMatch(/Email OTP/);
    expect(readme).not.toMatch(/Send code/);
    expect(readme).toContain('id="grok-prompt"');
    expect(readme).not.toMatch(/Email me a sign-in link/);
    expect(readme).not.toMatch(/Enable Email magic link/);
    expect(readme).not.toMatch(/Gmail’s in-app browser/);
    expect(readme).not.toMatch(/open the (?:magic )?link on this same phone/i);
    expect(readme).toMatch(/Create this week's meals/);
    expect(readme).toMatch(/Waiting for your Bot…/);
    expect(readme).toMatch(/Finish house setup/);
    expect(readme).toMatch(/walk through house setup \(no Seed\/sample week\)/);
    expect(readme).toMatch(/Setup · step N of 7/);
    expect(readme).toMatch(/20260917160000_wizard_v2_ballot_request\.sql/);
    expect(readme).toMatch(/all nine/);
    expect(readme).toMatch(/20260927040000_bot_check_cadence\.sql/);
    expect(readme).toMatch(/request_week_ballot/);
    expect(readme).toMatch(/ballot_requests/);
    expect(readme).toMatch(/Copy paste for your Grok Bot/);
    expect(readme).toMatch(/DIY fallback only \(collapsed\)/);
    expect(readme).toMatch(/No default stores/);
    expect(readme).toMatch(/type in a store/);
    expect(readme).not.toMatch(/Ask your Bot for 7 dinners/);
    expect(readme).not.toMatch(/Ask your Bot for this week's meals/);
    expect(readme).not.toMatch(/5-step setup/);
    expect(readme).not.toMatch(/A partner share-link \/join\/<token> is coming/);
    expect(readme).not.toMatch(/grandma/i);
    expect(readme).toMatch(/easy for anyone/);
    expect(readme).toMatch(/cart adds only where the store actually supports them/);
    expect(readme).toMatch(/Do NOT invent prices/);
    expect(readme).toMatch(/Do NOT claim unsupported cart features/);
    expect(readme).not.toMatch(/no store cart-add claims/);
    expect(readme).not.toMatch(/change nothing about.{0,40}carts/i);

    const appReadme = readFileSync(path.join(srcRoot, "../README.md"), "utf8");
    expect(appReadme).not.toMatch(/grandma/i);
    expect(appReadme).toMatch(/easy for anyone/);
    expect(existsSync(path.join(srcRoot, "../apps/app/README.md"))).toBe(false);

    const paste = grokPromptPaste(readme);
    expect(paste).toMatch(/Confirm email OFF/);
    expect(paste).toMatch(/email \+ password/);
    expect(paste).toMatch(/Create account/);
    expect(paste).toMatch(/\{\{ \.Token \}\}/);
    expect(paste).toMatch(/Optional later: custom SMTP/);
    expect(paste).toMatch(/not a magic link/);
    expect(paste).not.toMatch(/Email OTP/);
    expect(paste).not.toMatch(/Send code/);
    expect(paste).not.toMatch(/Email me a sign-in link/);
    expect(paste).not.toMatch(/Enable Email magic link/);
    expect(paste).not.toMatch(/grandma/i);
    expect(paste).toMatch(/cart adds only where the store actually supports them/);
    expect(paste).toMatch(/Do NOT invent prices/);
  });

  it("shows the backend setup gate when Supabase env is missing", () => {
    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const gate = readFileSync(path.join(srcRoot, "components/auth-gate.tsx"), "utf8");
    const setupGate = readFileSync(path.join(srcRoot, "components/backend-setup-gate.tsx"), "utf8");

    expect(login).toContain("BackendSetupGate");
    expect(login).toContain('mode === "setup"');
    expect(gate).toContain("BackendSetupGate");
    expect(setupGate).toContain('data-slot="backend-setup-gate"');
    expect(setupGate).toContain("BACKEND_SETUP_STEPS");
    expect(setupGate).toContain("BACKEND_SETUP_CTA");
    expect(setupGate).toContain('size="fat"');
  });
});

describe("no localStorage household product path", () => {
  it("does not ship demo-repo or a silent localStorage household", () => {
    expect(existsSync(path.join(srcRoot, "lib/demo-repo.ts"))).toBe(false);
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");
    const config = readFileSync(path.join(srcRoot, "lib/config.ts"), "utf8");
    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    expect(provider).not.toContain("demo-repo");
    expect(provider).not.toContain('mode === "demo"');
    expect(provider).not.toContain("seedDemoWeek");
    expect(provider).not.toContain("supabaseSeedDemoWeek");
    expect(provider).toContain('mode: "setup" | "supabase"');
    expect(config).not.toContain("STORAGE_KEY");
    expect(config).not.toContain("SESSION_KEY");
    expect(login).not.toContain("Continue as");
    expect(login).not.toContain("localStorage");
  });
});

describe("Clear Sky setup craft", () => {
  it("restyles first-run setup and /setup on Clear Sky cards, not Kitchen Paper", () => {
    const wizard = readFileSync(path.join(srcRoot, "components/setup-wizard.tsx"), "utf8");
    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const setupPage = readFileSync(path.join(srcRoot, "app/setup/page.tsx"), "utf8");
    const setupGate = readFileSync(path.join(srcRoot, "components/backend-setup-gate.tsx"), "utf8");

    expect(setupPage).toContain("LoginHome");
    expect(login).toContain('data-slot="login-home"');
    expect(login).toContain("BackendSetupGate");
    expect(setupGate).toContain('size="wordmark"');
    expect(wizard).toContain('data-slot="setup-wizard"');
    expect(wizard).toContain('data-slot="setup-card"');
    expect(wizard).toContain('data-slot="setup-cta"');
    expect(wizard).toContain("rounded-[var(--radius-button)]");
    expect(wizard).toContain('variant="primary"');
    expect(wizard).toContain("InviteShare");
    expect(wizard).not.toContain("SAMPLE_WEEK_CALLOUT");
    expect(wizard).not.toContain("rounded-2xl");
    expect(wizard).not.toContain("#b35025");
    expect(wizard).not.toContain("Fraunces");
    expect(wizard).not.toContain("Clear Sky");
    expect(wizard).not.toContain("Blue & White");
    expect(wizard).not.toContain("Tim");
    expect(wizard).not.toContain("Rose");
    expect(login).not.toContain("Clear Sky");
    expect(login).not.toContain("#b35025");
    expect(login).not.toContain("Fraunces");
    expect(setupGate).toContain("bg-card");
    expect(setupGate).toContain('variant="primary"');
    expect(setupGate).not.toContain("#b35025");
    expect(setupGate).not.toContain("Fraunces");
    expect(setupGate).not.toContain("Clear Sky");
  });
});
