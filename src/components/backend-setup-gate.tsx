"use client";

import { useState, useSyncExternalStore } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { getSupabaseSetupStatus } from "@/lib/config";
import { INSTALL_BROWSER_COPY } from "@/lib/install";
import {
  BACKEND_SETUP_CTA,
  BACKEND_SETUP_HELPER,
  BACKEND_SETUP_STEPS,
  BACKEND_SETUP_TITLE,
  SETUP_STARTED_KEY,
  backendSetupStatusMessage,
  shouldOpenBackendChecklist,
} from "@/lib/setup";

function hasStartedSetup(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SETUP_STARTED_KEY) === "1";
}

function subscribeSetupStarted(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function markSetupStarted() {
  window.sessionStorage.setItem(SETUP_STARTED_KEY, "1");
}

export function BackendSetupGate() {
  const status = getSupabaseSetupStatus();
  const started = useSyncExternalStore(subscribeSetupStarted, hasStartedSetup, () => false);
  const [openedHere, setOpenedHere] = useState(false);
  const showChecklist = shouldOpenBackendChecklist(status, started || openedHere);
  const statusMessage = backendSetupStatusMessage(status);

  return (
    <div
      data-slot="backend-setup-gate"
      data-setup-status={status}
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-6 pb-0 pt-[max(1.25rem,env(safe-area-inset-top))]"
    >
      <BrandMark size="wordmark" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <section data-slot="setup-card" className="space-y-4 rounded-[14px] bg-card p-5 shadow-card">
            <div>
              <h1 className="type-display text-foreground">{BACKEND_SETUP_TITLE}</h1>
              <p className="type-body mt-2 text-muted-foreground">{BACKEND_SETUP_HELPER}</p>
            </div>
            {statusMessage ? (
              <p data-slot="setup-status" className="type-body text-foreground">
                {statusMessage}
              </p>
            ) : null}
            {showChecklist ? (
              <div data-slot="setup-checklist" className="space-y-4">
                <ol className="space-y-4">
                  {BACKEND_SETUP_STEPS.map((step, index) => (
                    <li key={step.id} className="space-y-1">
                      <p className="type-section text-primary">
                        {index + 1}. {step.title}
                      </p>
                      <p className="type-body text-muted-foreground">{step.body}</p>
                    </li>
                  ))}
                </ol>
                <p className="type-meta text-muted-foreground">{INSTALL_BROWSER_COPY}</p>
              </div>
            ) : null}
          </section>
        </div>
        {!showChecklist ? (
          <div
            data-slot="setup-cta"
            className="sticky bottom-0 z-10 -mx-6 mt-4 shrink-0 border-t border-border/70 bg-card/95 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md"
          >
            <Button
              type="button"
              size="fat"
              variant="primary"
              className="w-full"
              aria-label={BACKEND_SETUP_CTA}
              onClick={() => {
                markSetupStarted();
                setOpenedHere(true);
              }}
            >
              {BACKEND_SETUP_CTA}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
