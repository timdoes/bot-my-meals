"use client";

import { useRef, useState } from "react";
import { PlanningPeopleGate } from "@/components/planning-people-gate";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOptionalSupper } from "@/components/whos-eating-sheet";
import {
  EDIT_NIGHTS_CANCEL_LABEL,
  EDIT_NIGHTS_LABEL,
  EDIT_NIGHTS_SAVE_ERROR,
  dinnersTurningOff,
  planWeekNightChanges,
  savedNewNightsToast,
  showWeekSpecialInstructions,
  turnOffDinnerConfirm,
  withFrozenNights,
} from "@/lib/edit-nights";
import type { NightPeopleInput } from "@/lib/food-rules";
import { clampSpecialInstructions } from "@/lib/planning-people";
import { isFoodRulesSchemaReady } from "@/lib/supabase/missing-schema";
import type { Household, Meal, Membership, Vote, WeekRole } from "@/lib/types";
import { sameNightCounts, showWhosEatingFeature } from "@/lib/whos-eating";

export function EditNightsSheet({
  open,
  role,
  household,
  initialCounts,
  storedInstructions,
  meals,
  votes,
  memberships,
  frozenWeekdays,
  busy = false,
  onOpenChange,
  onSave,
  onSaved,
}: {
  open: boolean;
  role: WeekRole;
  household: Household;
  initialCounts: number[];
  storedInstructions: string | null;
  meals: readonly Pick<Meal, "id" | "title" | "nightDate" | "servings">[];
  votes: Vote[];
  memberships: Membership[];
  frozenWeekdays: readonly number[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (counts: number[], instructions: string | null) => Promise<void>;
  onSaved?: (message: string | null) => void;
}) {
  const supper = useOptionalSupper();
  const weekId =
    role === "planning" ? supper?.snapshot?.planning?.week.id : supper?.snapshot?.week.id;
  const featureOn = showWhosEatingFeature({
    schemaReady: isFoodRulesSchemaReady(),
    eaters: supper?.snapshot?.eaters ?? [],
    memberships: supper?.snapshot?.memberships ?? memberships,
  });
  const showNotes = showWeekSpecialInstructions({ role, stored: storedInstructions });
  const pending = useRef<{
    counts: number[];
    instructions: string | null;
    attendees: NightPeopleInput[] | null;
  } | null>(null);
  const [confirming, setConfirming] = useState<string[]>([]);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [savingOff, setSavingOff] = useState(false);

  const persist = async (
    counts: number[],
    instructions: string | null,
    attendees: NightPeopleInput[] | null,
  ) => {
    const platesChanged = !sameNightCounts(initialCounts, counts);
    if (featureOn && supper && weekId && attendees) {
      await supper.saveWeekPeopleV2(weekId, counts, instructions, attendees);
      if (platesChanged) await onSave(counts, instructions);
      return;
    }
    await onSave(counts, instructions);
  };

  const commit = async (
    counts: number[],
    instructions: string | null,
    attendees: NightPeopleInput[] | null,
  ) => {
    const changes = planWeekNightChanges({
      previous: initialCounts,
      next: counts,
      hasMeals: meals.length > 0,
    });
    await persist(counts, instructions, attendees);
    onSaved?.(savedNewNightsToast(changes, meals.length > 0));
    setConfirming([]);
    pending.current = null;
    onOpenChange(false);
  };

  const close = () => {
    setConfirming([]);
    setSheetError(null);
    pending.current = null;
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <SheetContent side="bottom" className="px-4" data-slot="edit-nights-sheet">
        <SheetHeader className="px-0">
          <SheetTitle>{EDIT_NIGHTS_LABEL}</SheetTitle>
          <SheetDescription>Change which nights get dinner this week.</SheetDescription>
        </SheetHeader>
        {sheetError ? (
          <p data-slot="edit-nights-error" className="type-meta text-destructive">
            {sheetError}
          </p>
        ) : null}
        <PlanningPeopleGate
          key={open ? "editing" : "closed"}
          household={household}
          canEdit
          busy={busy || savingOff}
          initialCounts={initialCounts}
          initialInstructions={storedInstructions ?? ""}
          showInstructions={showNotes}
          lockedWeekdays={frozenWeekdays}
          cancelLabel={EDIT_NIGHTS_CANCEL_LABEL}
          weekId={weekId ?? undefined}
          showCoverage={false}
          onBack={close}
          onSave={async (counts, instructions, attendees) => {
            const next = withFrozenNights(initialCounts, counts, frozenWeekdays);
            const notes = showNotes ? clampSpecialInstructions(instructions) : null;
            const offs = dinnersTurningOff({
              previous: initialCounts,
              next,
              meals,
              votes,
              memberships,
            });
            if (offs.length > 0) {
              pending.current = { counts: next, instructions: notes, attendees: attendees ?? null };
              setConfirming(offs);
              return;
            }
            setSheetError(null);
            await commit(next, notes, attendees ?? null);
          }}
        />
        {confirming.length > 0 ? (
          <div
            data-slot="turn-off-night"
            className="mt-3 rounded-[14px] border border-border bg-card p-4 shadow-card"
            role="alertdialog"
            aria-labelledby="turn-off-night-title"
          >
            <p id="turn-off-night-title" className="type-body font-semibold">
              {confirming.length === 1
                ? turnOffDinnerConfirm(confirming[0] ?? "")
                : "Turn off these nights?"}
            </p>
            {confirming.length > 1 ? (
              <ul className="type-meta mt-2 space-y-1 text-muted-foreground">
                {confirming.map((weekday) => (
                  <li key={weekday}>{turnOffDinnerConfirm(weekday)}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="fat"
                className="flex-1"
                onClick={() => {
                  setConfirming([]);
                  pending.current = null;
                }}
              >
                Keep
              </Button>
              <Button
                type="button"
                variant="primary"
                size="fat"
                className="flex-1"
                disabled={savingOff}
                onClick={() => {
                  const next = pending.current;
                  if (!next) return;
                  setSavingOff(true);
                  setSheetError(null);
                  void commit(next.counts, next.instructions, next.attendees)
                    .catch((err: unknown) => {
                      setSheetError(
                        err instanceof Error && err.message ? err.message : EDIT_NIGHTS_SAVE_ERROR,
                      );
                    })
                    .finally(() => setSavingOff(false));
                }}
              >
                {savingOff ? "Saving…" : "Turn off"}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
