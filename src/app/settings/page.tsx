"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AddToHomeRow } from "@/components/add-to-home-row";
import { AppearancePicker } from "@/components/appearance-picker";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { BotWakeSettings } from "@/components/bot-wake-settings";
import { HouseCard } from "@/components/house-card";
import { useSupper } from "@/components/supper-provider";
import { Button } from "@/components/ui/button";
import {
  HELP_FEEDBACK_URL,
  SETTINGS_EYEBROW,
  SETTINGS_HELP_FEEDBACK,
  SETTINGS_SECTION_ACCOUNT,
  SETTINGS_SECTION_APP,
  SETTINGS_SECTION_BOT,
  SETTINGS_SECTION_HELP,
  SETTINGS_TITLE,
  SETTINGS_VERSION,
  SIGNING_OUT_LABEL,
  SIGN_OUT_LABEL,
  appVersionLabel,
} from "@/lib/house-settings";
import { isAdmin, roleLabel } from "@/lib/users";

/** Settings = you and this app (HOUSE-SETTINGS-SPLIT §3). The household lives on /house. */
export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsBody />
    </AuthGate>
  );
}

function SectionHead({ id, children }: { id: string; children: string }) {
  return (
    <h2 data-slot="settings-section" data-section={id} className="type-eyebrow mt-8 text-muted-foreground first:mt-2">
      {children}
    </h2>
  );
}

function SettingsBody() {
  const { snapshot, session, signOut } = useSupper();
  const router = useRouter();
  const owner = isAdmin(session?.role);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <AppShell title={SETTINGS_TITLE} eyebrow={SETTINGS_EYEBROW}>
      <SectionHead id="account">{SETTINGS_SECTION_ACCOUNT}</SectionHead>
      <HouseCard className="mt-3">
        <p className="type-eyebrow text-primary">Signed in as</p>
        <p className="type-title mt-1">{session?.displayName}</p>
        <p className="type-meta text-muted-foreground">
          {session?.email}
          {session?.role ? ` · ${roleLabel(session.role)}` : null}
        </p>
        <Button
          variant="outline"
          size="fat"
          className="mt-3 w-full"
          disabled={signingOut}
          aria-busy={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut()
              .then(() => router.push("/login"))
              .catch(() => setSigningOut(false));
          }}
        >
          {signingOut ? SIGNING_OUT_LABEL : SIGN_OUT_LABEL}
        </Button>
      </HouseCard>

      <SectionHead id="app">{SETTINGS_SECTION_APP}</SectionHead>
      <AppearancePicker />
      <div className="mt-3">
        <AddToHomeRow />
      </div>

      {snapshot ? (
        <>
          <SectionHead id="bot">{SETTINGS_SECTION_BOT}</SectionHead>
          <BotWakeSettings canEdit={owner} />
        </>
      ) : null}

      <SectionHead id="help">{SETTINGS_SECTION_HELP}</SectionHead>
      <div className="mt-3 space-y-3">
        <a
          href={HELP_FEEDBACK_URL}
          target="_blank"
          rel="noreferrer"
          data-slot="help-feedback-row"
          className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
        >
          <span className="type-section text-primary">{SETTINGS_HELP_FEEDBACK}</span>
          <ExternalLink className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </a>
        <div
          data-slot="version-row"
          className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
        >
          <span className="type-section">{SETTINGS_VERSION}</span>
          <span className="type-meta font-mono text-muted-foreground">
            {appVersionLabel(process.env.NEXT_PUBLIC_APP_VERSION)}
          </span>
        </div>
      </div>
    </AppShell>
  );
}
