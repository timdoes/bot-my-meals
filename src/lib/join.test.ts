import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOIN_CTA,
  JOIN_HELPER,
  JOIN_HOUSE_SAMPLE,
  JOIN_SHARE_PREFILL,
  JOIN_TITLE,
  canUseNativeShare,
  isJoinTokenFormat,
  joinInviteBody,
  joinPath,
  joinShareText,
  joinTokenReason,
  joinUrl,
  parseJoinPeek,
} from "./join";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("join invite copy", () => {
  it("locks You’re invited copy and Our house sample", () => {
    expect(JOIN_TITLE).toBe("You’re invited");
    expect(JOIN_CTA).toBe("Continue");
    expect(JOIN_HELPER).toMatch(/No invite code/);
    expect(JOIN_HOUSE_SAMPLE).toBe("Our house");
    expect(joinInviteBody("Our house")).toBe(
      "This link opens Our house. Continue to join the table and see this week's dinners.",
    );
    expect(joinInviteBody("  ")).toMatch(/Our house/);
  });
});

describe("join invite link", () => {
  it("builds a Kinwyn-style /join/<token> URL", () => {
    expect(joinPath("abc123def456")).toBe("/join/abc123def456");
    expect(joinUrl("https://bot-my-meals.example.workers.dev", "abc123def456")).toBe(
      "https://bot-my-meals.example.workers.dev/join/abc123def456",
    );
    expect(joinUrl("https://bot-my-meals.example.workers.dev/", "abc123def456")).toBe(
      "https://bot-my-meals.example.workers.dev/join/abc123def456",
    );
  });

  it("prefills share text with the locked sentence plus URL", () => {
    expect(JOIN_SHARE_PREFILL).toBe(
      "Join our Bot My Meals house — open this in your browser:",
    );
    expect(joinShareText("https://example.test/join/token1")).toBe(
      "Join our Bot My Meals house — open this in your browser:\nhttps://example.test/join/token1",
    );
  });

  it("accepts url-safe tokens and rejects junk", () => {
    expect(isJoinTokenFormat("a1b2c3d4e5f6")).toBe(true);
    expect(isJoinTokenFormat("deadbeef".repeat(4))).toBe(true);
    expect(isJoinTokenFormat("short")).toBe(false);
    expect(isJoinTokenFormat("../secret")).toBe(false);
    expect(isJoinTokenFormat("has space")).toBe(false);
  });

  it("explains expired, used, and invalid without a paste-code dead end", () => {
    expect(joinTokenReason("expired")).toMatch(/expired/i);
    expect(joinTokenReason("expired")).toMatch(/new link/i);
    expect(joinTokenReason("used")).toMatch(/already used/i);
    expect(joinTokenReason("invalid")).toMatch(/not valid/i);
    expect(joinTokenReason("ok")).toBe("");
    for (const status of ["expired", "used", "invalid"] as const) {
      expect(joinTokenReason(status).toLowerCase()).not.toContain("invite code");
      expect(joinTokenReason(status).toLowerCase()).not.toContain("paste");
    }
  });

  it("parses peek payloads and treats unknown status as invalid", () => {
    expect(parseJoinPeek(null)).toEqual({ status: "invalid" });
    expect(
      parseJoinPeek({
        status: "ok",
        household_name: "Our house",
        household_id: "hh-1",
      }),
    ).toEqual({
      status: "ok",
      householdName: "Our house",
      householdId: "hh-1",
    });
    expect(parseJoinPeek({ status: "used" })).toEqual({ status: "used" });
    expect(parseJoinPeek({ status: "nope" })).toEqual({ status: "invalid" });
  });

  it("does not claim native share in this test runtime", () => {
    expect(canUseNativeShare()).toBe(false);
  });
});

describe("join landing and House invite surfaces", () => {
  it("routes /join/<token> through app chrome and an in-app email code", () => {
    const page = readFileSync(path.join(srcRoot, "app/join/[token]/page.tsx"), "utf8");
    const landing = readFileSync(path.join(srcRoot, "components/join-landing.tsx"), "utf8");
    const share = readFileSync(path.join(srcRoot, "components/invite-share.tsx"), "utf8");
    const house = readFileSync(path.join(srcRoot, "app/settings/page.tsx"), "utf8");
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");

    expect(page).toContain("JoinLanding");
    expect(landing).toContain("AppShell");
    expect(landing).toContain("hideNav");
    expect(landing).toContain("JOIN_TITLE");
    expect(landing).toContain("JOIN_CTA");
    expect(landing).toContain("PasswordAuthForm");
    expect(landing).toContain('initialMode="create"');
    expect(landing).not.toContain("CheckEmailCard");
    expect(landing).not.toContain("Email me a sign-in link");
    expect(landing).not.toContain("LOGIN_SAME_DEVICE");
    expect(landing).not.toMatch(/household password/i);
    expect(landing).toContain("claimJoinToken");
    expect(landing).toContain("Ask your partner to share a new invite link");
    expect(landing).not.toContain("Join with code");
    expect(landing).not.toContain("Invite code");
    expect(landing).not.toContain("Create your own");
    expect(landing).not.toContain("Join this house");

    expect(share).toContain("Share invite link");
    expect(share).toContain("shareJoinInvite");
    expect(share).not.toContain("<details");
    expect(share).not.toContain("Invite code");
    expect(share).not.toContain("Copy code");
    expect(share).not.toContain("inviteCode");

    expect(house).toContain("InviteShare");
    expect(house).toContain("createJoinToken");
    expect(provider).toContain("signUp");
    expect(provider).toContain("signInWithPassword");
    expect(provider).toContain("resetPasswordForEmail");
    expect(provider).not.toContain("signInWithOtp");
    expect(provider).toContain("passwordResetRedirectUrl");
  });
});
