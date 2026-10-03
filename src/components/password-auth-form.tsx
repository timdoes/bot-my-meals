"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PasswordField } from "@/components/password-field";
import { useSupper } from "@/components/supper-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignInOrigin } from "@/components/use-sign-in-origin";
import {
  AUTH_ERROR_OFFLINE,
  CREATE_ACCOUNT_BUSY,
  CREATE_ACCOUNT_CTA,
  CREATE_ACCOUNT_HELPER,
  CREATE_ACCOUNT_LINK,
  CREATE_ACCOUNT_SWITCH,
  CREATE_ACCOUNT_TITLE,
  FORGOT_PASSWORD,
  PASSWORD_HINT,
  RESET_BACK,
  RESET_BODY,
  RESET_SEND,
  RESET_SENDING,
  RESET_SENT_HELPER,
  RESET_SENT_TITLE,
  RESET_TITLE,
  SIGN_IN_BUSY,
  SIGN_IN_CTA,
  SIGN_IN_HELPER,
  SIGN_IN_LINK,
  SIGN_IN_TITLE,
  SIGNIN_ERROR_MISMATCH,
  clientPasswordBlock,
  passwordAuthFailureMessage,
  signInOriginLine,
} from "@/lib/login";

type AuthScreen = "sign-in" | "create" | "reset" | "reset-sent";

export function PasswordAuthForm({
  callbackError = null,
  initialMode = "sign-in",
}: {
  callbackError?: string | null;
  initialMode?: "sign-in" | "create";
}) {
  const { signUpWithPassword, signInWithPassword, requestPasswordReset } = useSupper();
  const [screen, setScreen] = useState<AuthScreen>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"create" | "signin" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(callbackError);
  const inFlight = useRef(false);
  const origin = useSignInOrigin();
  const trimmedEmail = email.trim();

  const go = (next: AuthScreen) => {
    setScreen(next);
    setError(null);
    setPassword("");
    setConfirm("");
  };

  const offline = () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError(AUTH_ERROR_OFFLINE);
      return true;
    }
    return false;
  };

  const createAccount = async () => {
    if (inFlight.current) return;
    const blocked = clientPasswordBlock(password, confirm);
    if (blocked) {
      setError(blocked);
      return;
    }
    if (offline()) return;
    inFlight.current = true;
    setBusy("create");
    setError(null);
    try {
      await signUpWithPassword(trimmedEmail, password);
    } catch (err) {
      setError(passwordAuthFailureMessage("signup", err, navigator.onLine));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const signIn = async () => {
    if (inFlight.current) return;
    if (!trimmedEmail || !password) {
      setError(SIGNIN_ERROR_MISMATCH);
      return;
    }
    if (offline()) return;
    inFlight.current = true;
    setBusy("signin");
    setError(null);
    try {
      await signInWithPassword(trimmedEmail, password);
    } catch (err) {
      setError(passwordAuthFailureMessage("signin", err, navigator.onLine));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const sendReset = async () => {
    if (inFlight.current) return;
    if (offline()) return;
    inFlight.current = true;
    setBusy("reset");
    setError(null);
    try {
      await requestPasswordReset(trimmedEmail);
      setScreen("reset-sent");
    } catch (err) {
      setError(passwordAuthFailureMessage("reset", err, navigator.onLine));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const originLine = origin ? (
    <p className="type-meta text-muted-foreground">{signInOriginLine(origin)}</p>
  ) : null;

  const alert = error ? (
    <p className="text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  const emailField = (
    <Input
      type="email"
      required
      inputMode="email"
      autoComplete={screen === "sign-in" ? "username" : "email"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder="you@example.com"
      value={email}
      disabled={busy !== null}
      onChange={(event) => {
        setEmail(event.target.value);
        setError(null);
      }}
      className="h-12 min-h-12 rounded-[var(--radius-button)] bg-card text-base"
      aria-label="Email address"
      aria-invalid={error ? true : undefined}
    />
  );

  switch (screen) {
    case "create":
      return (
        <form
          key="create"
          data-slot="password-auth"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createAccount();
          }}
        >
          {alert}
          <h1 className="type-title text-foreground">{CREATE_ACCOUNT_TITLE}</h1>
          <p className="type-body text-muted-foreground">{CREATE_ACCOUNT_HELPER}</p>
          {originLine}
          {emailField}
          <PasswordField
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(null);
            }}
            autoComplete="new-password"
            ariaLabel="Password"
            disabled={busy !== null}
            invalid={Boolean(error)}
          />
          <PasswordField
            value={confirm}
            onChange={(value) => {
              setConfirm(value);
              setError(null);
            }}
            autoComplete="new-password"
            ariaLabel="Confirm password"
            disabled={busy !== null}
            invalid={Boolean(error)}
          />
          <p className="type-meta text-muted-foreground">{PASSWORD_HINT}</p>
          <Button
            type="submit"
            size="fat"
            variant="primary"
            className="w-full"
            disabled={busy !== null}
            aria-busy={busy === "create"}
          >
            {busy === "create" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {busy === "create" ? CREATE_ACCOUNT_BUSY : CREATE_ACCOUNT_CTA}
          </Button>
          <p className="text-center text-base text-muted-foreground">
            {CREATE_ACCOUNT_SWITCH}{" "}
            <button
              type="button"
              className="font-semibold text-primary"
              onClick={() => go("sign-in")}
            >
              {SIGN_IN_LINK}
            </button>
          </p>
        </form>
      );
    case "sign-in":
      return (
        <form
          key="sign-in"
          data-slot="password-auth"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          {alert}
          <h1 className="type-title text-foreground">{SIGN_IN_TITLE}</h1>
          <p className="type-body text-muted-foreground">{SIGN_IN_HELPER}</p>
          {originLine}
          {emailField}
          <PasswordField
            value={password}
            onChange={(value) => {
              setPassword(value);
              setError(null);
            }}
            autoComplete="current-password"
            ariaLabel="Password"
            disabled={busy !== null}
            invalid={Boolean(error)}
          />
          <Button
            type="submit"
            size="fat"
            variant="primary"
            className="w-full"
            disabled={busy !== null}
            aria-busy={busy === "signin"}
          >
            {busy === "signin" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {busy === "signin" ? SIGN_IN_BUSY : SIGN_IN_CTA}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full text-base"
            disabled={busy !== null}
            onClick={() => go("create")}
          >
            {CREATE_ACCOUNT_LINK}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full text-base"
            disabled={busy !== null}
            onClick={() => go("reset")}
          >
            {FORGOT_PASSWORD}
          </Button>
        </form>
      );
    case "reset":
      return (
        <form
          key="reset"
          data-slot="password-auth"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendReset();
          }}
        >
          {alert}
          <h1 className="type-title text-foreground">{RESET_TITLE}</h1>
          <p className="type-body text-muted-foreground">{RESET_BODY}</p>
          {emailField}
          <Button
            type="submit"
            size="fat"
            variant="primary"
            className="w-full"
            disabled={busy !== null}
            aria-busy={busy === "reset"}
          >
            {busy === "reset" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {busy === "reset" ? RESET_SENDING : RESET_SEND}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full text-base"
            disabled={busy !== null}
            onClick={() => go("sign-in")}
          >
            {RESET_BACK}
          </Button>
        </form>
      );
    case "reset-sent":
      return (
        <div key="reset-sent" data-slot="password-auth" className="space-y-3">
          <h1 className="type-title text-foreground">{RESET_SENT_TITLE}</h1>
          <p className="type-body text-muted-foreground">
            If an account exists for{" "}
            <strong className="font-semibold text-foreground">{trimmedEmail}</strong>, we sent a
            reset link. Set the new password, then open this app and{" "}
            <strong className="font-semibold text-foreground">sign in</strong>.
          </p>
          <p className="type-body text-muted-foreground">{RESET_SENT_HELPER}</p>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-12 w-full text-base"
            onClick={() => go("sign-in")}
          >
            {RESET_BACK}
          </Button>
        </div>
      );
    default: {
      const _exhaustive: never = screen;
      return _exhaustive;
    }
  }
}
