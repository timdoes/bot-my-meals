import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { grokPromptPaste } from "./install-docs";
import {
  AUTH_ERROR_OFFLINE,
  CREATE_ACCOUNT_CTA,
  CREATE_ACCOUNT_HELPER,
  CREATE_ACCOUNT_TITLE,
  FORGOT_PASSWORD,
  LOGIN_CALLBACK_FAILED_COPY,
  NEW_PASSWORD_SAVED_BODY,
  PASSWORD_HINT,
  PASSWORD_MISMATCH,
  PASSWORD_TOO_SHORT,
  RESET_BODY,
  RESET_SEND,
  RESET_SENT_HELPER,
  RESET_SENT_TITLE,
  RESET_TITLE,
  SIGN_IN_CTA,
  SIGN_IN_HELPER,
  SIGN_IN_TITLE,
  SIGNIN_ERROR_GENERIC,
  SIGNIN_ERROR_MISMATCH,
  SIGNIN_ERROR_RATE,
  SIGNUP_ERROR_EXISTS,
  SIGNUP_ERROR_GENERIC,
  SIGNUP_ERROR_NO_SESSION,
  SIGNUP_ERROR_RATE,
  SIGNUP_ERROR_WEAK,
  authCallbackRedirectPath,
  clientPasswordBlock,
  isRecoveryHash,
  legacyAuthCallbackUrl,
  loginCallbackFailedMessage,
  loginCallbackFailedPath,
  passwordAuthFailureMessage,
  passwordMeetsMinimum,
  passwordResetRedirectUrl,
  resetSentBody,
  safeAuthNext,
  signInOriginLine,
} from "./login";

const srcRoot = path.resolve(import.meta.dirname, "..");

describe("email and password sign-in copy", () => {
  it("locks Create account, Sign in, and reset in the app", () => {
    expect(CREATE_ACCOUNT_TITLE).toBe("Create your account");
    expect(CREATE_ACCOUNT_HELPER).toBe("Use your own email. You’ll sign in using this browser.");
    expect(CREATE_ACCOUNT_CTA).toBe("Create account");
    expect(PASSWORD_HINT).toBe("At least 8 characters.");
    expect(PASSWORD_TOO_SHORT).toBe("Use at least 8 characters.");
    expect(PASSWORD_MISMATCH).toBe("Those passwords don’t match.");
    expect(SIGN_IN_TITLE).toBe("Sign in");
    expect(SIGN_IN_HELPER).toBe("Use the email and password for this device.");
    expect(SIGN_IN_CTA).toBe("Sign in");
    expect(FORGOT_PASSWORD).toBe("Forgot password?");
    expect(RESET_TITLE).toBe("Reset password");
    expect(RESET_BODY).toBe(
      "We’ll email a reset link. After you set a new password, open Bot My Meals and sign in.",
    );
    expect(RESET_SEND).toBe("Send reset link");
    expect(RESET_SENT_TITLE).toBe("Check your email");
    expect(resetSentBody("alex@example.com")).toBe(
      "If an account exists for alex@example.com, we sent a reset link. Set the new password, then open this app and sign in.",
    );
    expect(RESET_SENT_HELPER).toBe(
      "Prefer asking your household partner for a new invite if you can’t get into email.",
    );
    expect(NEW_PASSWORD_SAVED_BODY).toBe(
      "Open Bot My Meals and sign in with your new password.",
    );
    expect(signInOriginLine("https://bot-my-meals.example.workers.dev")).toBe(
      "You’re signing in on https://bot-my-meals.example.workers.dev.",
    );
    expect(passwordMeetsMinimum("12345678")).toBe(true);
    expect(passwordMeetsMinimum("1234567")).toBe(false);
    expect(clientPasswordBlock("short", "short")).toBe(PASSWORD_TOO_SHORT);
    expect(clientPasswordBlock("longenough", "different")).toBe(PASSWORD_MISMATCH);
    expect(clientPasswordBlock("longenough", "longenough")).toBeNull();
    expect(clientPasswordBlock("longenough")).toBeNull();
    expect(isRecoveryHash("#access_token=a&refresh_token=b&type=recovery")).toBe(true);
    expect(isRecoveryHash("#access_token=a&refresh_token=b&type=magiclink")).toBe(false);
    expect(passwordResetRedirectUrl("https://bot-my-meals.example.workers.dev/")).toBe(
      "https://bot-my-meals.example.workers.dev/login/new-password",
    );

    const login = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const form = readFileSync(path.join(srcRoot, "components/password-auth-form.tsx"), "utf8");
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");
    const updated = readFileSync(path.join(srcRoot, "components/new-password-form.tsx"), "utf8");

    expect(login).toContain("BrandMark");
    expect(login).toContain("PasswordAuthForm");
    expect(login).not.toContain("Email me a sign-in link");
    expect(login).not.toContain("CheckEmailCard");
    expect(login).not.toMatch(/Safari/);
    expect(login).not.toMatch(/grandma/i);
    expect(form).toContain("CREATE_ACCOUNT_TITLE");
    expect(form).toContain("SIGN_IN_TITLE");
    expect(form).toContain("RESET_TITLE");
    expect(form).toContain("RESET_SENT_TITLE");
    expect(form).toContain('aria-label="Email address"');
    expect(form).toContain('screen === "sign-in" ? "username" : "email"');
    expect(form).toContain('autoComplete="new-password"');
    expect(form).toContain('autoComplete="current-password"');
    expect(form).toContain("signUpWithPassword");
    expect(form).toContain("signInWithPassword");
    expect(form).toContain("requestPasswordReset");
    expect(form).toContain("open this app and");
    expect(form).toContain('variant="ghost"');
    expect(form).not.toContain("Email me a sign-in link");
    expect(form).not.toContain("Sign in with a code");
    expect(form).not.toMatch(/Safari|Gmail|grandma|Apple|Google/i);
    expect(provider).toContain("signUp");
    expect(provider).toContain("signInWithPassword");
    expect(provider).toContain("resetPasswordForEmail");
    expect(provider).toContain('flowType: "implicit"');
    expect(provider).not.toContain("signInWithOtp");
    expect(provider).not.toContain("signInMagicLink");
    expect(provider).not.toContain("localStorage");
    expect(updated).toContain("setSession");
    expect(updated).toContain("updatePassword");
    expect(updated).toContain("NEW_PASSWORD_SAVED_BODY");
    expect(updated).not.toMatch(/Safari|grandma/i);
  });

  it("maps failures to one short line", () => {
    expect(SIGNUP_ERROR_EXISTS).toBe(
      "That email already has an account. Sign in, or reset your password.",
    );
    expect(SIGNUP_ERROR_WEAK).toBe("Choose a different password and try again.");
    expect(SIGNUP_ERROR_RATE).toBe("Too many tries. Wait a minute and try again.");
    expect(AUTH_ERROR_OFFLINE).toBe("You’re offline. Try again when you’re back.");
    expect(SIGNUP_ERROR_GENERIC).toBe("Couldn’t create the account. Try again.");
    expect(SIGNIN_ERROR_MISMATCH).toBe("Email or password doesn’t match.");
    expect(SIGNIN_ERROR_RATE).toBe("Too many tries. Wait a bit, or reset your password.");
    expect(SIGNIN_ERROR_GENERIC).toBe("Sign-in didn’t finish. Try again.");

    expect(passwordAuthFailureMessage("signup", { message: "User already registered" })).toBe(
      SIGNUP_ERROR_EXISTS,
    );
    expect(passwordAuthFailureMessage("signup", new Error("user_already_exists"))).toBe(
      SIGNUP_ERROR_EXISTS,
    );
    expect(passwordAuthFailureMessage("signup", new Error("signup_no_session"))).toBe(
      SIGNUP_ERROR_NO_SESSION,
    );
    expect(passwordAuthFailureMessage("signup", new Error("password_too_short"))).toBe(
      PASSWORD_TOO_SHORT,
    );
    expect(
      passwordAuthFailureMessage("signup", { code: "weak_password", message: "Password is known" }),
    ).toBe(SIGNUP_ERROR_WEAK);
    expect(passwordAuthFailureMessage("signup", { status: 429, message: "too many requests" })).toBe(
      SIGNUP_ERROR_RATE,
    );
    expect(passwordAuthFailureMessage("signin", { message: "Invalid login credentials" })).toBe(
      SIGNIN_ERROR_MISMATCH,
    );
    expect(passwordAuthFailureMessage("signin", { status: 429, message: "Request rate limit" })).toBe(
      SIGNIN_ERROR_RATE,
    );
    expect(passwordAuthFailureMessage("signin", new TypeError("Failed to fetch"))).toBe(
      AUTH_ERROR_OFFLINE,
    );
    expect(passwordAuthFailureMessage("signup", new Error("boom"), false)).toBe(AUTH_ERROR_OFFLINE);
    expect(passwordAuthFailureMessage("reset", { message: "Unable to send" })).toBe(
      "Couldn’t send the reset link. Try again.",
    );
    expect(passwordAuthFailureMessage("signin", { message: "Token has expired or is invalid" })).not.toMatch(
      /Safari|Gmail|grandma/i,
    );
    expect(passwordAuthFailureMessage("update", { code: "weak_password", message: "no" })).toBe(
      SIGNUP_ERROR_WEAK,
    );
  });
});

describe("auth callback failure surface", () => {
  it("sends a failed or missing exchange back to sign in", () => {
    expect(loginCallbackFailedPath()).toBe("/login?error=auth");
    expect(
      authCallbackRedirectPath({
        next: "/week",
        code: "pkce-code",
        exchangeFailed: true,
      }),
    ).toBe("/login?error=auth");
    expect(
      authCallbackRedirectPath({
        next: "/week",
        code: "pkce-code",
        exchangeFailed: false,
      }),
    ).toBe("/week");
    expect(
      authCallbackRedirectPath({
        next: "/recipes",
        code: "pkce-code",
        exchangeFailed: false,
      }),
    ).toBe("/recipes");
    expect(
      authCallbackRedirectPath({
        next: "/week",
        code: null,
        exchangeFailed: false,
      }),
    ).toBe("/login?error=auth");
    expect(
      authCallbackRedirectPath({
        next: "/join/abc123def456",
        code: "pkce-code",
        exchangeFailed: false,
      }),
    ).toBe("/join/abc123def456");
  });

  it("keeps a legacy callback next on-site so join can still return", () => {
    expect(safeAuthNext("/join/abc123def456")).toBe("/join/abc123def456");
    expect(safeAuthNext("//evil.example")).toBe("/week");
    expect(safeAuthNext("https://evil.example")).toBe("/week");
    expect(safeAuthNext(undefined)).toBe("/week");
    expect(legacyAuthCallbackUrl("https://bot-my-meals.example.workers.dev", "/week")).toBe(
      "https://bot-my-meals.example.workers.dev/auth/callback",
    );
    expect(
      legacyAuthCallbackUrl("https://bot-my-meals.example.workers.dev/", "/join/abc123def456"),
    ).toBe("https://bot-my-meals.example.workers.dev/auth/callback?next=%2Fjoin%2Fabc123def456");
  });

  it("shows a short reason on /login for ?error=auth", () => {
    expect(LOGIN_CALLBACK_FAILED_COPY).toBe(
      "That link didn’t finish. Sign in, or request a new reset.",
    );
    expect(LOGIN_CALLBACK_FAILED_COPY).not.toMatch(/Safari|Gmail|grandma/i);
    expect(loginCallbackFailedMessage("auth")).toBe(LOGIN_CALLBACK_FAILED_COPY);
    expect(loginCallbackFailedMessage(["auth"])).toBe(LOGIN_CALLBACK_FAILED_COPY);
    expect(loginCallbackFailedMessage("other")).toBeNull();
    expect(loginCallbackFailedMessage(undefined)).toBeNull();

    const loginPage = readFileSync(path.join(srcRoot, "app/login/page.tsx"), "utf8");
    const loginHome = readFileSync(path.join(srcRoot, "components/login-home.tsx"), "utf8");
    const form = readFileSync(path.join(srcRoot, "components/password-auth-form.tsx"), "utf8");
    const callback = readFileSync(path.join(srcRoot, "app/auth/callback/route.ts"), "utf8");
    const client = readFileSync(path.join(srcRoot, "lib/supabase/client.ts"), "utf8");

    expect(loginPage).toContain("loginCallbackFailedMessage");
    expect(loginPage).toContain("callbackError");
    expect(loginHome).toContain("callbackError");
    expect(form).toContain('role="alert"');
    expect(callback).toContain("authCallbackRedirectPath");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).toContain("exchangeFailed");
    expect(callback).not.toMatch(/await supabase\.auth\.exchangeCodeForSession\(code\);\s*\}/);
    expect(client).toContain("createBrowserClient");
    expect(client).toContain("supabaseAuthCookieOptions");
    expect(client).toContain("detectSessionInUrl: false");
    expect(client).not.toContain("localStorage");
  });
});

describe("install paste for email and password", () => {
  it("documents Confirm email OFF and does not require SMTP", () => {
    const readme = readFileSync(path.join(srcRoot, "../README.md"), "utf8");
    const domains = readFileSync(path.join(srcRoot, "../docs/domains.md"), "utf8");
    const paste = grokPromptPaste(readme);
    for (const doc of [readme, domains, paste]) {
      expect(doc).toMatch(/Confirm email OFF/);
      expect(doc).toMatch(/email \+ password/);
      expect(doc).toMatch(/Create account/);
      expect(doc).toMatch(/not a magic link/);
      expect(doc).toMatch(/Optional later: custom SMTP/);
      expect(doc).toMatch(/\{\{ \.Token \}\}/);
      expect(doc).not.toMatch(/Email OTP/);
      expect(doc).not.toMatch(/Send code/);
      expect(doc).not.toMatch(/Add custom SMTP/);
      expect(doc).not.toMatch(/Email me a sign-in link/);
      expect(doc).not.toMatch(/Enable Email magic link/);
      expect(doc).not.toMatch(/Gmail’s in-app browser/);
      expect(doc).not.toMatch(/grandma/i);
      expect(doc).not.toMatch(/email verified/i);
    }
    expect(readme).toMatch(/auth\/callback/);
    expect(readme).toMatch(/login\/new-password/);
    expect(readme).toContain('id="grok-prompt"');
    expect(domains).toMatch(/Site URL/);
    expect(domains).toMatch(/no shared household password/i);
    expect(paste).toMatch(/auth\/callback/);
    expect(paste).toMatch(/Site URL/);
    expect(paste).toMatch(/Do not turn on Apple or Google for Install/);
    expect(paste).toMatch(/Passkeys later/);
    expect(paste).toMatch(/no shared household password/i);
    expect(paste).not.toMatch(/Optional later: passwords/);
    expect(paste).toMatch(/easy for anyone/);
    expect(paste).toMatch(/cart adds only where the store actually supports them/);
    expect(paste).toMatch(/Do NOT invent prices/);
  });
});
