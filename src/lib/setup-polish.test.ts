import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JOIN_CTA, JOIN_HELPER, JOIN_HOUSE_SAMPLE, JOIN_TITLE, joinInviteBody } from "./join";
import {
  CREATE_ACCOUNT_HELPER,
  CREATE_ACCOUNT_TITLE,
  RESET_BODY,
  SIGN_IN_TITLE,
} from "./login";
import { CREATE_HOUSE_BODY, CREATE_HOUSE_DEFAULT_NAME, CREATE_HOUSE_TITLE } from "./setup";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("setup polish copy lock", () => {
  it("keeps Create account and Sign in in the app, not a mail-link button", () => {
    expect(CREATE_ACCOUNT_TITLE).toBe("Create your account");
    expect(CREATE_ACCOUNT_HELPER).toBe("Use your own email. You’ll sign in in this browser.");
    expect(SIGN_IN_TITLE).toBe("Sign in");
    expect(RESET_BODY).toMatch(/open Bot My Meals and sign in/);

    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const form = readFileSync(path.join(srcRoot, "components/password-auth-form.tsx"), "utf8");
    expect(login).toContain("PasswordAuthForm");
    expect(login).not.toContain("Link sent");
    expect(login).not.toContain("CheckEmailCard");
    expect(form).toContain('data-slot="password-auth"');
    expect(form).toContain('role="alert"');
    expect(form).toContain('variant="ghost"');
    expect(form).toContain('variant="primary"');
    expect(form).not.toContain("Link sent");
    expect(form).not.toContain("Email me a sign-in link");
    expect(form).not.toMatch(/Safari|grandma/i);
  });

  it("kills invite-code UI and keeps first-timers on one create path", () => {
    expect(JOIN_TITLE).toBe("You’re invited");
    expect(JOIN_CTA).toBe("Continue");
    expect(JOIN_HELPER).toBe("One household. No invite code to type.");
    expect(JOIN_HOUSE_SAMPLE).toBe("Our house");
    expect(joinInviteBody("Our house")).toMatch(/This link opens Our house/);
    expect(CREATE_HOUSE_TITLE).toBe("Create household");
    expect(CREATE_HOUSE_BODY).toBe("We’ll plan plates for everyone at the table.");
    expect(CREATE_HOUSE_BODY).not.toMatch(/Alex|Jordan/);
    expect(CREATE_HOUSE_DEFAULT_NAME).toBe("Our house");

    const onboarding = readFileSync(path.join(srcRoot, "components/onboarding.tsx"), "utf8");
    const landing = readFileSync(path.join(srcRoot, "components/join-landing.tsx"), "utf8");
    const share = readFileSync(path.join(srcRoot, "components/invite-share.tsx"), "utf8");
    const wizard = readFileSync(path.join(srcRoot, "components/setup-wizard.tsx"), "utf8");
    const house = readFileSync(path.join(srcRoot, "app/settings/page.tsx"), "utf8");

    expect(onboarding).not.toContain("Join a table");
    expect(onboarding).not.toContain("joinHousehold");
    expect(onboarding).not.toContain("displayName");
    expect(landing).toContain("hideNav");
    expect(landing).not.toContain("Create your own");
    expect(landing).not.toContain("Join with code");
    expect(share).not.toContain("Invite code");
    expect(share).not.toContain("inviteCode");
    expect(wizard).not.toContain("inviteCode");
    expect(house).not.toContain("inviteCode={");
    expect(onboarding).not.toMatch(/\bTim\b/);
    expect(onboarding).not.toMatch(/\bRose\b/);
    expect(onboarding).not.toMatch(/\bAlex\b/);
    expect(onboarding).not.toMatch(/\bJordan\b/);
    expect(landing).not.toMatch(/\bTim\b/);
    expect(landing).not.toMatch(/\bRose\b/);
    expect(wizard).not.toMatch(/\bAlex\b/);
    expect(wizard).not.toMatch(/\bJordan\b/);
  });

  it("keeps the people stepper and replaces nights-count chips with Sun–Sat toggles", () => {
    const wizard = readFileSync(path.join(srcRoot, "components/setup-wizard.tsx"), "utf8");
    const toggles = readFileSync(path.join(srcRoot, "components/night-toggles.tsx"), "utf8");
    expect(wizard).toContain("household-size");
    expect(wizard).not.toContain("HOUSE_SIZE_LATER_HELPER");
    expect(wizard).toContain("NightToggles");
    expect(wizard).toContain("hideNav");
    expect(wizard).toContain("compactOffNights");
    expect(wizard).not.toContain("plates-adjust");
    expect(wizard).not.toContain("[1, 2, 3, 4, 5, 6, 7]");
    expect(wizard).not.toContain("nights-planned");
    expect(toggles).toContain("WEEKDAY_LABELS");
    expect(toggles).toContain('data-slot="night-toggles"');
    expect(toggles).toContain("Switch");
    expect(wizard).not.toMatch(/>\s*Skip\s*</);
  });
});
