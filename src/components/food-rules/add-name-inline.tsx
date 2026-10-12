"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADD_NAME_HELPER,
  EATER_CAP_ERROR,
  EATER_NAME_MAX,
  HOUSEHOLD_EATERS_MAX,
  validateEaterName,
} from "@/lib/food-rules";
import type { HouseholdEater } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ADD_A_NAME_CHIP,
  ADD_NAME_FIELD_LABEL,
  ADD_NAME_PLACEHOLDER,
  ADD_NAME_SUBMIT,
  CANCEL_LABEL,
} from "./copy";

export function AddNameInline({
  existing,
  onAdd,
  disabled = false,
  chipLabel = ADD_A_NAME_CHIP,
  helper = ADD_NAME_HELPER,
  placeholder = ADD_NAME_PLACEHOLDER,
  fullWidth = false,
  memberNames = [],
  defaultOpen = false,
  onClose,
}: {
  existing: readonly HouseholdEater[];
  onAdd: (name: string) => void | Promise<void>;
  disabled?: boolean;
  chipLabel?: string;
  helper?: string;
  placeholder?: string;
  fullWidth?: boolean;
  /** Display names of signed-in people; a name that matches one is rejected. */
  memberNames?: readonly string[];
  /** Start with the field open (used where another chip already opened it). */
  defaultOpen?: boolean;
  /** Called when the field closes after a cancel or a successful add. */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setDraft("");
    setError(null);
    onClose?.();
  };

  const submit = () => {
    if (busy) return;
    if (existing.length >= HOUSEHOLD_EATERS_MAX) {
      setError(EATER_CAP_ERROR);
      return;
    }
    const invalid = validateEaterName(draft, existing, undefined, memberNames);
    if (invalid) {
      setError(invalid);
      return;
    }
    const name = draft.trim();
    setBusy(true);
    void Promise.resolve(onAdd(name))
      .then(() => reset())
      .catch((err: unknown) => {
        setError(err instanceof Error && err.message ? err.message : "Could not add that name.");
      })
      .finally(() => setBusy(false));
  };

  if (disabled) return null;

  if (!open) {
    return (
      <button
        type="button"
        data-slot="add-name-inline"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-11 items-center justify-center rounded-full border border-dashed border-border px-4 text-sm font-semibold text-primary",
          fullWidth && "w-full rounded-[14px]",
        )}
      >
        {chipLabel}
      </button>
    );
  }

  return (
    <div data-slot="add-name-inline" data-open="true" className={cn("space-y-2", fullWidth && "w-full")}>
      <div className="flex items-center gap-2">
        <Input
          aria-label={ADD_NAME_FIELD_LABEL}
          value={draft}
          maxLength={EATER_NAME_MAX}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              reset();
            }
          }}
          className="h-11 min-h-11 flex-1 rounded-full px-4"
        />
        <Button type="button" size="fat" variant="primary" className="px-4" onClick={submit} disabled={busy}>
          {ADD_NAME_SUBMIT}
        </Button>
        <Button type="button" size="fat" variant="outline" className="px-4" onClick={reset}>
          {CANCEL_LABEL}
        </Button>
      </div>
      <p className="type-meta text-muted-foreground">{helper}</p>
      {error ? <p className="type-meta text-destructive">{error}</p> : null}
    </div>
  );
}
