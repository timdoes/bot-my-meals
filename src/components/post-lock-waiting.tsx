"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { BallotToast } from "@/components/ballot-toast";
import { useBotJustNotified, useBotWakeConfigured, useWakeNow } from "@/components/use-bot-wake";
import { OfflineAskButton, WakePhaseButton } from "@/components/wake-button";
import { requestBotWake, type WakeClientResult } from "@/lib/bot-wake-client";
import { BOT_CHECK_NOW_HINT, BOT_CHECK_NOW_LABEL } from "@/lib/bot-check";
import { waitingWeekCue } from "@/lib/open-weeks";
import {
  POST_LOCK_BOT_NOTIFIED,
  POST_LOCK_GET_RECIPES_LABEL,
  POST_LOCK_WAKE_SETTINGS,
  POST_LOCK_WAITING_BODY,
  POST_LOCK_WAITING_TITLE,
  RECIPE_PENDING_BODY,
  RECIPE_PENDING_TITLE,
  getRecipesHint,
  recipePendingHint,
  type LockedDinnerTap,
} from "@/lib/post-lock-waiting";
import type { WeekRole } from "@/lib/types";
import {
  WAKE_CHECK_HINT,
  WAKE_CHECKING_LABEL,
  WAKE_MEALS_NOTIFIED,
  WAKE_MEALS_PENDING_BODY,
  WAKE_WAKING_LABEL,
} from "@/lib/wake-feedback";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type WaitingVoice = "recipes" | "meals";

export function PostLockWaitingDetails({
  showTitle = true,
  showBody = true,
  wakeConfigured,
  onGetRecipes,
  weekRole = "cooking",
  startsOn,
  bothOpen = false,
  voice = "recipes",
  className,
}: {
  showTitle?: boolean;
  showBody?: boolean;
  wakeConfigured?: boolean;
  onGetRecipes?: () => void | Promise<WakeClientResult | void>;
  weekRole?: WeekRole;
  startsOn?: string;
  bothOpen?: boolean;
  voice?: WaitingVoice;
  className?: string;
}) {
  const configured = useBotWakeConfigured(wakeConfigured);
  const heard = useBotJustNotified();
  const { phase, notified, message, dismiss, wake } = useWakeNow(async () => {
    return Promise.resolve(onGetRecipes ? onGetRecipes() : requestBotWake("check_now"));
  });
  const wakeOn = configured === true;
  const justNotified = wakeOn && (notified || heard);
  const mealsVoice = voice === "meals";
  const hint = mealsVoice
    ? wakeOn
      ? WAKE_CHECK_HINT
      : BOT_CHECK_NOW_HINT
    : getRecipesHint(weekRole, wakeOn);
  const idleLabel = mealsVoice ? BOT_CHECK_NOW_LABEL : POST_LOCK_GET_RECIPES_LABEL;
  const body = mealsVoice
    ? justNotified
      ? WAKE_MEALS_NOTIFIED
      : WAKE_MEALS_PENDING_BODY
    : POST_LOCK_WAITING_BODY;
  const cue = startsOn ? waitingWeekCue(weekRole, startsOn, { bothOpen }) : null;

  return (
    <div className={className}>
      {showTitle ? (
        <h2 data-slot="post-lock-waiting-title" className="type-section text-primary">
          {POST_LOCK_WAITING_TITLE}
        </h2>
      ) : null}
      {cue ? (
        <p data-slot="waiting-week-cue" className="type-meta mt-1 text-foreground">
          {cue}
        </p>
      ) : null}
      {showBody ? (
        <p className={cn("type-body text-muted-foreground", showTitle && "mt-2")}>{body}</p>
      ) : null}
      {!mealsVoice && justNotified ? (
        <p data-slot="post-lock-notified" className="type-meta mt-3 text-foreground">
          {POST_LOCK_BOT_NOTIFIED}
        </p>
      ) : null}
      <div data-slot="post-lock-get-recipes" data-wake={wakeOn ? "on" : "off"}>
        {wakeOn ? (
          <WakePhaseButton
            phase={phase}
            idleLabel={idleLabel}
            wakingLabel={mealsVoice ? WAKE_CHECKING_LABEL : WAKE_WAKING_LABEL}
            onWake={wake}
            className="mt-4 w-full"
          />
        ) : configured === false ? (
          <OfflineAskButton idleLabel={idleLabel} className="mt-4 w-full" />
        ) : (
          <p className="type-body mt-4 font-semibold">{idleLabel}</p>
        )}
        <p className="type-meta mt-1 text-muted-foreground">{hint}</p>
      </div>
      <BallotToast message={message} onDismiss={dismiss} />
      <Link
        href="/settings#wake-your-bot"
        data-slot="post-lock-bot-settings"
        className="type-meta mt-4 inline-flex min-h-12 items-center font-semibold text-primary"
      >
        {POST_LOCK_WAKE_SETTINGS}
      </Link>
    </div>
  );
}

export function PostLockWaitingCard({
  wakeConfigured,
  weekRole = "cooking",
  startsOn,
  bothOpen = false,
  className,
}: {
  wakeConfigured?: boolean;
  weekRole?: WeekRole;
  startsOn?: string;
  bothOpen?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="post-lock-waiting"
      className={cn("rounded-[14px] bg-card p-4 shadow-card ring-1 ring-primary/20", className)}
    >
      <PostLockWaitingDetails
        wakeConfigured={wakeConfigured}
        weekRole={weekRole}
        startsOn={startsOn}
        bothOpen={bothOpen}
      />
    </div>
  );
}

export function MealsWaitingCard({
  wakeConfigured,
  weekRole = "cooking",
  startsOn,
  bothOpen = false,
  className,
}: {
  wakeConfigured?: boolean;
  weekRole?: WeekRole;
  startsOn?: string;
  bothOpen?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="meals-waiting"
      className={cn("rounded-[14px] bg-card p-4 shadow-card ring-1 ring-primary/20", className)}
    >
      <PostLockWaitingDetails
        wakeConfigured={wakeConfigured}
        weekRole={weekRole}
        startsOn={startsOn}
        bothOpen={bothOpen}
        voice="meals"
      />
    </div>
  );
}

export function PostLockWaitingSheet({
  open,
  onOpenChange,
  wakeConfigured,
  weekRole = "cooking",
  startsOn,
  bothOpen = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wakeConfigured?: boolean;
  weekRole?: WeekRole;
  startsOn?: string;
  bothOpen?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton className="rounded-t-[16px]" data-waiting-sheet="true">
        <SheetHeader>
          <SheetTitle className="type-section pr-8 text-left text-primary">{POST_LOCK_WAITING_TITLE}</SheetTitle>
          <SheetDescription className="type-body text-muted-foreground">{POST_LOCK_WAITING_BODY}</SheetDescription>
        </SheetHeader>
        <PostLockWaitingDetails
          showTitle={false}
          showBody={false}
          wakeConfigured={wakeConfigured}
          weekRole={weekRole}
          startsOn={startsOn}
          bothOpen={bothOpen}
          className="px-4 pb-2"
        />
      </SheetContent>
    </Sheet>
  );
}

export function RecipePendingNotice({
  wakeConfigured,
  onWake,
  weekRole = "cooking",
}: {
  wakeConfigured?: boolean;
  onWake?: () => void | Promise<WakeClientResult | void>;
  weekRole?: WeekRole;
}) {
  const configured = useBotWakeConfigured(wakeConfigured);
  const wakeOn = configured === true;
  const { phase, notified, message, dismiss, wake } = useWakeNow(onWake);
  const hint = recipePendingHint(weekRole, wakeOn);

  return (
    <div data-slot="recipe-pending" data-wake={wakeOn ? "on" : "off"} className="rounded-[14px] bg-card p-5 shadow-card">
      <h2 className="type-section">{RECIPE_PENDING_TITLE}</h2>
      <p className="type-body mt-2 text-muted-foreground">{RECIPE_PENDING_BODY}</p>
      {wakeOn ? (
        <WakePhaseButton
          phase={phase}
          idleLabel={hint}
          wakingLabel={WAKE_WAKING_LABEL}
          onWake={wake}
          className="mt-4 w-full"
          slot="recipe-pending-hint"
        />
      ) : configured === false ? (
        <>
          <p data-slot="recipe-pending-hint" className="type-meta mt-3 text-muted-foreground">
            {hint}
          </p>
          <OfflineAskButton idleLabel={BOT_CHECK_NOW_LABEL} className="mt-4 w-full" />
        </>
      ) : (
        <p data-slot="recipe-pending-hint" className="type-meta mt-3 text-muted-foreground">
          {hint}
        </p>
      )}
      {wakeOn && notified ? (
        <p data-slot="wake-notified" className="type-meta mt-3 text-foreground">
          {POST_LOCK_BOT_NOTIFIED}
        </p>
      ) : null}
      <BallotToast message={message} onDismiss={dismiss} />
    </div>
  );
}

export function LockedNightFrame({
  tap,
  href,
  title,
  onWaiting,
  children,
}: {
  tap: LockedDinnerTap;
  href: string;
  title: string;
  onWaiting: () => void;
  children: ReactNode;
}) {
  switch (tap) {
    case "none":
      return children;
    case "waiting":
      return (
        <button
          type="button"
          data-slot="locked-night-waiting"
          className="block w-full border-0 bg-transparent p-0 text-left font-[inherit] text-inherit"
          aria-label={`${title}. ${POST_LOCK_WAITING_TITLE}`}
          onClick={onWaiting}
        >
          {children}
        </button>
      );
    case "recipe":
    case "review":
      return (
        <Link
          href={href}
          data-slot={tap === "review" ? "past-meal-review" : "locked-night-recipe"}
          className="block"
        >
          {children}
        </Link>
      );
    default: {
      const _exhaustive: never = tap;
      return _exhaustive;
    }
  }
}
