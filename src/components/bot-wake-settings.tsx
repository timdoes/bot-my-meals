"use client";

import { useState } from "react";
import { BotCheckNow } from "@/components/bot-check-frequency";
import { HouseCard } from "@/components/house-card";
import { markBotWakeConfigured, useBotWakeConfigured } from "@/components/use-bot-wake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOT_WAKE_CREATE_BODY,
  BOT_WAKE_CREATE_SAVED,
  BOT_WAKE_EMPTY,
  BOT_WAKE_KEY_HELPER,
  BOT_WAKE_KEY_LABEL,
  BOT_WAKE_KEY_PLACEHOLDER,
  BOT_WAKE_REPLACE,
  BOT_WAKE_SAVED,
  BOT_WAKE_SECTION_LABEL,
  BOT_WAKE_URL_HELPER,
  BOT_WAKE_URL_LABEL,
  BOT_WAKE_URL_PLACEHOLDER,
} from "@/lib/bot-wake";
import { saveBotWakeSettings } from "@/lib/bot-wake-client";
import { ADMIN_BADGE, WAKE_READ_ONLY_NOTE } from "@/lib/house-settings";

export function BotWakeSettings({
  canEdit,
  configured: configuredOverride,
  placement = "settings",
}: {
  canEdit: boolean;
  configured?: boolean;
  placement?: "settings" | "setup";
}) {
  const fetched = useBotWakeConfigured(configuredOverride) === true;
  const [justSaved, setJustSaved] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showSaved = fetched || justSaved;
  const showForm = canEdit && (!showSaved || replacing);
  const savedLine = wakeSavedLine(placement);

  return (
    <HouseCard
      id="wake-your-bot"
      className={placement === "setup" ? "scroll-mt-24" : "mt-6 scroll-mt-24"}
      data-slot="bot-wake-settings"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="type-section text-primary">{BOT_WAKE_SECTION_LABEL}</h2>
        {placement === "settings" ? (
          <span
            data-slot="bot-wake-admin-badge"
            className="type-chip inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-muted-foreground"
          >
            {ADMIN_BADGE}
          </span>
        ) : null}
      </div>
      {!canEdit && placement === "settings" ? (
        <p data-slot="bot-wake-read-only" className="type-meta mt-1 text-muted-foreground">
          {WAKE_READ_ONLY_NOTE}
        </p>
      ) : null}
      {canEdit && placement === "settings" ? (
        <p className="type-meta mt-1 text-muted-foreground">{BOT_WAKE_URL_HELPER}</p>
      ) : null}
      {canEdit && placement === "setup" && !showSaved ? (
        <p className="type-meta mt-1 text-muted-foreground">{BOT_WAKE_CREATE_BODY}</p>
      ) : null}
      {showSaved ? (
        <div className="mt-3 space-y-3">
          <p data-slot="bot-wake-saved" className="type-meta text-foreground">
            {savedLine}
          </p>
          {canEdit && !replacing ? (
            <Button
              type="button"
              variant="outline"
              size="fat"
              className="w-full"
              data-slot="bot-wake-replace"
              onClick={() => {
                setUrl("");
                setKey("");
                setError(null);
                setReplacing(true);
              }}
            >
              {BOT_WAKE_REPLACE}
            </Button>
          ) : null}
        </div>
      ) : (
        <p data-slot="bot-wake-empty" className="type-meta mt-3 text-muted-foreground">
          {BOT_WAKE_EMPTY}
        </p>
      )}
      {showForm ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setBusy(true);
            void saveBotWakeSettings({ url, key })
              .then((result) => {
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setUrl("");
                setKey("");
                setReplacing(false);
                setJustSaved(true);
                markBotWakeConfigured();
              })
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="bot-wake-url">{BOT_WAKE_URL_LABEL}</Label>
            <Input
              id="bot-wake-url"
              name="bot-wake-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={BOT_WAKE_URL_PLACEHOLDER}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-wake-key">{BOT_WAKE_KEY_LABEL}</Label>
            <p className="type-meta text-muted-foreground">{BOT_WAKE_KEY_HELPER}</p>
            <Input
              id="bot-wake-key"
              name="bot-wake-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={BOT_WAKE_KEY_PLACEHOLDER}
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </div>
          <Button size="fat" className="w-full" disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : "Save webhook"}
          </Button>
          {error ? <p className="type-meta text-destructive">{error}</p> : null}
        </form>
      ) : null}
      {placement === "settings" && canEdit ? <BotCheckNow wakeConfigured={configuredOverride} /> : null}
    </HouseCard>
  );
}

function wakeSavedLine(placement: "settings" | "setup"): string {
  switch (placement) {
    case "settings":
      return BOT_WAKE_SAVED;
    case "setup":
      return BOT_WAKE_CREATE_SAVED;
    default: {
      const _exhaustive: never = placement;
      return _exhaustive;
    }
  }
}
