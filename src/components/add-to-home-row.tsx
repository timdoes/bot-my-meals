"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { isStandaloneDisplay } from "@/lib/install";
import { SETTINGS_INSTALL, SETTINGS_INSTALL_SUB } from "@/lib/house-settings";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

export const ADD_TO_HOME_HOW =
  "Open your browser's Share or menu, then choose Add to Home Screen.";

/** Settings → App → Add to Home Screen. Hidden once the app already runs from the Home Screen. */
export function AddToHomeRow() {
  const [standalone, setStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStandalone(
        isStandaloneDisplay(
          (query) => window.matchMedia(query),
          "standalone" in navigator ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone) : false,
        ),
      );
    }, 0);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (standalone) return null;
  return (
    <div data-slot="add-to-home-row" className="rounded-[14px] bg-card shadow-card">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left"
        aria-expanded={deferred ? undefined : open}
        onClick={() => {
          if (deferred) {
            void deferred.prompt().finally(() => setDeferred(null));
            return;
          }
          setOpen((value) => !value);
        }}
      >
        <span className="min-w-0">
          <span className="type-section block text-primary">{SETTINGS_INSTALL}</span>
          <span className="type-meta mt-0.5 block text-muted-foreground">{SETTINGS_INSTALL_SUB}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open && !deferred ? (
        <p data-slot="add-to-home-how" className="type-meta px-5 pb-4 text-muted-foreground">
          {ADD_TO_HOME_HOW}
        </p>
      ) : null}
    </div>
  );
}
