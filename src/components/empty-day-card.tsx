"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  ADD_SHEET_PEOPLE_LABEL,
  ADD_SHEET_NOTE_LABEL,
  ADD_SHEET_PLACEHOLDER,
  ADD_SHEET_SEND,
  ADD_SHEET_TITLE,
  EMPTY_DAY_ADD,
  EMPTY_DAY_HELPER,
  EMPTY_DAY_TITLE,
  LOCKED_EMPTY_COPY,
  PENDING_ADD_CANCEL,
  PENDING_ADD_HELPER,
  PENDING_ADD_TITLE,
  SWAP_SHEET_CANCEL,
  addSheetHelper,
} from "@/lib/ballot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { mealCardControlId } from "@/lib/dates";
import { MAX_HEADCOUNT, MIN_HEADCOUNT, dinnerRequestPeople } from "@/lib/headcount";
import { AWAITING_MEAL_LABEL } from "@/lib/wake-feedback";
import { cn } from "@/lib/utils";

function renderEmptyDayBody({
  state,
  note,
  onAdd,
  onCancel,
  openAdd,
  cancelRequest,
}: {
  state: "empty" | "pending" | "locked" | "awaiting";
  note?: string;
  onAdd?: (note: string, people: number) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  openAdd: () => void;
  cancelRequest: () => void;
}) {
  switch (state) {
    case "locked":
      return <h2 className="type-section mt-1">{LOCKED_EMPTY_COPY}</h2>;
    case "pending":
      return (
        <>
          <h2 className="type-section mt-1">{PENDING_ADD_TITLE}</h2>
          <p className="type-body mt-2 text-muted-foreground">{PENDING_ADD_HELPER}</p>
          {note ? <p className="type-meta mt-2 text-muted-foreground">{note}</p> : null}
          {onCancel ? (
            <Button
              type="button"
              variant="link"
              className="mt-3 h-auto min-h-12 px-0 text-base"
              onClick={() => cancelRequest()}
            >
              {PENDING_ADD_CANCEL}
            </Button>
          ) : null}
        </>
      );
    case "awaiting":
      return (
        <h2 data-slot="awaiting-meal" className="type-section mt-1 text-muted-foreground">
          {AWAITING_MEAL_LABEL}
        </h2>
      );
    case "empty":
      return (
        <>
          <h2 className="type-section mt-1">{EMPTY_DAY_TITLE}</h2>
          <p className="type-body mt-2 text-muted-foreground">{EMPTY_DAY_HELPER}</p>
          {onAdd ? (
            <Button
              type="button"
              size="fat"
              variant="outline"
              className="mt-4 w-full gap-2"
              onClick={openAdd}
            >
              <Plus className="size-5" />
              {EMPTY_DAY_ADD}
            </Button>
          ) : null}
        </>
      );
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function EmptyDayCard({
  dayLabel,
  dayName,
  state,
  note,
  servings,
  onAdd,
  onCancel,
}: {
  dayLabel: string;
  dayName: string;
  state: "empty" | "pending" | "locked" | "awaiting";
  note?: string;
  servings?: number;
  onAdd?: (note: string, people: number) => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [people, setPeople] = useState(() => dinnerRequestPeople(servings));
  const noteFieldId = mealCardControlId("add-note", dayLabel);
  const peopleFieldId = mealCardControlId("add-people", dayLabel);

  const beginAdd = () => {
    setPeople(dinnerRequestPeople(servings));
    setOpen(true);
  };

  const requestDinner = () => {
    if (!onAdd) return;
    const pending = onAdd(draft.trim(), dinnerRequestPeople(people));
    setDraft("");
    setPeople(dinnerRequestPeople(servings));
    setOpen(false);
    void Promise.resolve(pending).catch(() => undefined);
  };

  const cancelRequest = () => {
    if (!onCancel) return;
    void Promise.resolve(onCancel()).catch(() => undefined);
  };

  return (
    <article
      data-slot="empty-day-card"
      data-state={state}
      className={cn(
        "rounded-[14px] p-4",
        state === "locked"
          ? "bg-secondary text-secondary-foreground shadow-card"
          : state === "empty"
            ? "border border-dashed border-border bg-card text-card-foreground"
            : "bg-card text-card-foreground shadow-card",
      )}
    >
      <p
        data-slot="meal-day-label"
        className={cn(
          "type-day-label",
          state === "locked" ? "text-secondary-foreground/70" : "text-muted-foreground",
        )}
      >
        {dayLabel}
      </p>
      {renderEmptyDayBody({ state, note, onAdd, onCancel, openAdd: beginAdd, cancelRequest })}

      {onAdd ? <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-[16px]"
        >
          <SheetHeader>
            <SheetTitle className="type-section">{ADD_SHEET_TITLE}</SheetTitle>
            <SheetDescription className="type-body">
              {addSheetHelper(dayName)}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label htmlFor={peopleFieldId} className="type-meta text-muted-foreground">
                {ADD_SHEET_PEOPLE_LABEL}
              </Label>
              <div
                data-slot="dinner-people-stepper"
                className="flex items-center justify-between gap-3 rounded-[14px] bg-secondary px-3 py-2"
              >
                <button
                  type="button"
                  aria-label={`Fewer people on ${dayName}`}
                  disabled={people <= MIN_HEADCOUNT}
                  onClick={() => setPeople(dinnerRequestPeople(people - 1))}
                  className="tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40"
                >
                  <Minus className="size-5" />
                </button>
                <input
                  id={peopleFieldId}
                  type="number"
                  inputMode="numeric"
                  min={MIN_HEADCOUNT}
                  max={MAX_HEADCOUNT}
                  value={people}
                  onChange={(event) => setPeople(dinnerRequestPeople(Number(event.target.value)))}
                  aria-label={`People on ${dayName}`}
                  className="h-12 w-14 rounded-[var(--radius-button)] border border-border bg-card text-center font-mono text-lg font-semibold tabular-nums"
                />
                <button
                  type="button"
                  aria-label={`More people on ${dayName}`}
                  disabled={people >= MAX_HEADCOUNT}
                  onClick={() => setPeople(dinnerRequestPeople(people + 1))}
                  className="tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40"
                >
                  <Plus className="size-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={noteFieldId} className="type-meta text-muted-foreground">
                {ADD_SHEET_NOTE_LABEL}
              </Label>
              <Textarea
                id={noteFieldId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={ADD_SHEET_PLACEHOLDER}
                className="min-h-24 rounded-[var(--radius-button)] text-base"
              />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              size="fat"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              {SWAP_SHEET_CANCEL}
            </Button>
            <Button
              type="button"
              size="fat"
              variant="primary"
              className="flex-1 shadow-float"
              onClick={() => requestDinner()}
            >
              {ADD_SHEET_SEND}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet> : null}
    </article>
  );
}
