export const PASSWORD_MIN_LENGTH = 8;

export const CREATE_ACCOUNT_TITLE = "Create your account";
export const CREATE_ACCOUNT_HELPER = "Use your own email. You’ll sign in using this browser.";
export const CREATE_ACCOUNT_CTA = "Create account";
export const CREATE_ACCOUNT_BUSY = "Creating…";
export const CREATE_ACCOUNT_SWITCH = "Already have an account?";

export const SIGN_IN_TITLE = "Sign in";
export const SIGN_IN_HELPER = "Use the email and password for this device.";
export const SIGN_IN_CTA = "Sign in";
export const SIGN_IN_BUSY = "Signing in…";
export const SIGN_IN_LINK = "Sign in";
export const CREATE_ACCOUNT_LINK = "Create account";
export const FORGOT_PASSWORD = "Forgot password?";

export const PASSWORD_HINT = "At least 8 characters.";
export const PASSWORD_TOO_SHORT = "Use at least 8 characters.";
export const PASSWORD_MISMATCH = "Those passwords don’t match.";
export const SHOW_PASSWORD = "Show password";
export const HIDE_PASSWORD = "Hide password";

export const SIGNUP_ERROR_EXISTS =
  "That email already has an account. Sign in, or reset your password.";
export const SIGNUP_ERROR_WEAK = "Choose a different password and try again.";
export const SIGNUP_ERROR_RATE = "Too many tries. Wait a minute and try again.";
export const AUTH_ERROR_OFFLINE = "You’re offline. Try again when you’re back.";
export const SIGNUP_ERROR_GENERIC = "Couldn’t create the account. Try again.";
export const SIGNUP_ERROR_NO_SESSION =
  "Account created, but you’re not signed in yet. Sign in with that password.";

export const SIGNIN_ERROR_MISMATCH = "Email or password doesn’t match.";
export const SIGNIN_ERROR_RATE = "Too many tries. Wait a bit, or reset your password.";
export const SIGNIN_ERROR_GENERIC = "Sign-in didn’t finish. Try again.";

export const RESET_TITLE = "Reset password";
export const RESET_BODY =
  "We’ll email a reset link. After you set a new password, open Bot My Meals and sign in.";
export const RESET_SEND = "Send reset link";
export const RESET_SENDING = "Sending…";
export const RESET_BACK = "Back to sign in";
export const RESET_SENT_TITLE = "Check your email";
export const RESET_SENT_HELPER =
  "Prefer asking your household partner for a new invite if you can’t get into email.";
export const RESET_ERROR_GENERIC = "Couldn’t send the reset link. Try again.";

export const NEW_PASSWORD_TITLE = "Set a new password";
export const NEW_PASSWORD_HELPER = "Then open Bot My Meals and sign in.";
export const NEW_PASSWORD_CTA = "Save password";
export const NEW_PASSWORD_BUSY = "Saving…";
export const NEW_PASSWORD_SAVED_TITLE = "Password saved";
export const NEW_PASSWORD_SAVED_BODY =
  "Open Bot My Meals and sign in with your new password.";
export const NEW_PASSWORD_MISSING =
  "Open the reset link from your email, then set a new password here.";
export const UPDATE_PASSWORD_ERROR = "Couldn’t save that password. Try again.";

export function signInOriginLine(origin: string): string {
  return `You’re signing in on ${origin}.`;
}

export function resetSentBody(email: string): string {
  return `If an account exists for ${email}, we sent a reset link. Set the new password, then open this app and sign in.`;
}

export function passwordMeetsMinimum(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

/** Pass `confirm` on create / new-password. Omit it on sign-in. */
export function clientPasswordBlock(password: string, confirm?: string): string | null {
  if (!passwordMeetsMinimum(password)) return PASSWORD_TOO_SHORT;
  if (confirm !== undefined && password !== confirm) return PASSWORD_MISMATCH;
  return null;
}

export function passwordResetRedirectUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/login/new-password`;
}

export function isRecoveryHash(hash: string): boolean {
  return recoverySessionFromHash(hash) !== null;
}

export function recoverySessionFromHash(
  hash: string,
): { access_token: string; refresh_token: string } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  if (params.get("type") !== "recovery") return null;
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export const LOGIN_CALLBACK_ERROR_PARAM = "error";
export const LOGIN_CALLBACK_ERROR_VALUE = "auth";

export const LOGIN_CALLBACK_FAILED_COPY =
  "That link didn’t finish. Sign in, or request a new reset.";

export function loginCallbackFailedPath(): string {
  return `/login?${LOGIN_CALLBACK_ERROR_PARAM}=${LOGIN_CALLBACK_ERROR_VALUE}`;
}

export function loginCallbackFailedMessage(
  errorParam: string | string[] | null | undefined,
): string | null {
  const value = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  return value === LOGIN_CALLBACK_ERROR_VALUE ? LOGIN_CALLBACK_FAILED_COPY : null;
}

export function safeAuthNext(next: string | string[] | null | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/week";
  }
  return value;
}

/** Legacy mail links only. Create account and Sign in finish in this app. */
export function legacyAuthCallbackUrl(origin: string, next?: string | null): string {
  const safe = safeAuthNext(next);
  const base = `${origin.replace(/\/$/, "")}/auth/callback`;
  if (safe === "/week") return base;
  return `${base}?next=${encodeURIComponent(safe)}`;
}

export function authCallbackRedirectPath({
  next,
  code,
  exchangeFailed,
}: {
  next: string;
  code: string | null;
  exchangeFailed: boolean;
}): string {
  if (!code || exchangeFailed) {
    return loginCallbackFailedPath();
  }
  return safeAuthNext(next);
}

export type PasswordAuthFailureKind = "signup" | "signin" | "reset" | "update";

function readAuthFailure(err: unknown): { message: string; status?: number; code?: string } {
  if (!err || typeof err !== "object") {
    return { message: err instanceof Error ? err.message : "" };
  }
  const record = err as { message?: unknown; status?: unknown; code?: unknown };
  return {
    message: typeof record.message === "string" ? record.message : "",
    status: typeof record.status === "number" ? record.status : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
  };
}

function isAuthRateLimited(status: number | undefined, code: string | undefined, message: string): boolean {
  const blob = `${code ?? ""} ${message}`.toLowerCase();
  return (
    status === 429 ||
    blob.includes("rate limit") ||
    blob.includes("too many") ||
    blob.includes("only request this after") ||
    blob.includes("over_email_send_rate_limit") ||
    blob.includes("over_request_rate_limit")
  );
}

function isAuthOffline(message: string): boolean {
  const blob = message.toLowerCase();
  return (
    blob.includes("failed to fetch") ||
    blob.includes("network") ||
    blob.includes("load failed") ||
    blob.includes("offline")
  );
}

function failureBlob(code: string | undefined, message: string): string {
  return `${code ?? ""} ${message}`.toLowerCase();
}

function isAlreadyRegistered(code: string | undefined, message: string): boolean {
  const blob = failureBlob(code, message);
  return (
    blob.includes("user already registered") ||
    blob.includes("already been registered") ||
    blob.includes("already registered") ||
    blob.includes("user_already_exists") ||
    blob.includes("email_exists")
  );
}

function isPasswordTooShortMessage(message: string): boolean {
  const blob = message.toLowerCase();
  return (
    blob.includes("password_too_short") ||
    (blob.includes("password") && (blob.includes("at least") || blob.includes("too short")))
  );
}

function isWeakPassword(code: string | undefined, message: string): boolean {
  const blob = failureBlob(code, message);
  return blob.includes("weak_password") || blob.includes("pwned") || blob.includes("leaked");
}

function isInvalidCredentials(code: string | undefined, message: string): boolean {
  const blob = failureBlob(code, message);
  return (
    blob.includes("invalid_credentials") ||
    blob.includes("invalid login") ||
    blob.includes("invalid email or password")
  );
}

export function passwordAuthFailureMessage(
  kind: PasswordAuthFailureKind,
  err: unknown,
  online = true,
): string {
  if (!online) return AUTH_ERROR_OFFLINE;
  const { message, status, code } = readAuthFailure(err);
  if (isAuthOffline(message)) return AUTH_ERROR_OFFLINE;
  if (isAuthRateLimited(status, code, message)) {
    switch (kind) {
      case "signup":
      case "reset":
      case "update":
        return SIGNUP_ERROR_RATE;
      case "signin":
        return SIGNIN_ERROR_RATE;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
  switch (kind) {
    case "signup":
      if (isAlreadyRegistered(code, message)) return SIGNUP_ERROR_EXISTS;
      if (message === "signup_no_session") return SIGNUP_ERROR_NO_SESSION;
      if (isPasswordTooShortMessage(message)) return PASSWORD_TOO_SHORT;
      if (isWeakPassword(code, message)) return SIGNUP_ERROR_WEAK;
      return SIGNUP_ERROR_GENERIC;
    case "signin":
      if (isInvalidCredentials(code, message)) return SIGNIN_ERROR_MISMATCH;
      return SIGNIN_ERROR_GENERIC;
    case "reset":
      return RESET_ERROR_GENERIC;
    case "update":
      if (isPasswordTooShortMessage(message) || isWeakPassword(code, message)) return SIGNUP_ERROR_WEAK;
      return UPDATE_PASSWORD_ERROR;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
