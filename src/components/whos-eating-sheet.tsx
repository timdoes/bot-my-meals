"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { AddNameInline } from "@/components/food-rules";
import { useSupper } from "@/components/supper-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { foodRuleWho, severityLabel } from "@/lib/food-rules";
import { MAX_HEADCOUNT } from "@/lib/headcount";
import { cn } from "@/lib/utils";
import type { FoodRule, HouseholdEater, Membership } from "@/lib/types";
import {
  ADD_NAME_LABEL,
  WHOS_EATING_ADD_NAME_HELPER,
  WHOS_EATING_ADD_NAME_PLACEHOLDER,
  WHOS_EATING_CANCEL,
  WHOS_EATING_CROSS_CONTACT,
  WHOS_EATING_DONE,
  WHOS_EATING_EATER_READONLY,
  WHOS_EATING_EVERYONE,
  WHOS_EATING_GUESTS_HELPER,
  WHOS_EATING_GUESTS_LABEL,
  WHOS_EATING_LABEL,
  WHOS_EATING_HELPER,
  WHOS_EATING_KEEP,
  WHOS_EATING_NEED_PERSON,
  WHOS_EATING_TAKE_OFF,
  allergyConfirmsOnRemove,
  applyChipToggle,
  applyEveryoneChip,
  canEditWhosEating,
  collapseIfEveryone,
  draftIsEveryone,
  footerPeoplePlatesLine,
  footerRulesLine,
  notApplyingLine,
  personIsSelected,
  planningAroundRules,
  platesForDraft,
  rulesForPerson,
  rulesInScopeForDraft,
  selectedPeopleCount,
  showWhosEatingFeature,
  showWhosEatingRow,
  takeOffBody,
  takeOffMealHitBody,
  takeOffTitle,
  whosEatingNamesLine,
  whosEatingRowAria,
  whosEatingRowLabel,
  whosEatingSheetTitle,
  withNamedListGuests,
  type AllergyConfirm,
  type NightPeopleDraft,
  type TablePerson,
} from "@/lib/whos-eating";

/** Bottom-sheet shell for the Who's eating sheet (not the food-rule form). */
function WhosEatingSheetShell({
  open,
  title,
  description,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side="bottom" showCloseButton={false} className="px-0" data-slot="whos-eating-sheet">
        <SheetHeader className="relative px-4">
          <SheetTitle className="type-section pr-16">{title}</SheetTitle>
          <button
            type="button"
            data-slot="whos-eating-cancel"
            className="type-meta absolute top-4 right-4 inline-flex min-h-11 items-center font-semibold text-primary"
            onClick={onClose}
          >
            {WHOS_EATING_CANCEL}
          </button>
          <SheetDescription className="type-body">{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">{children}</div>
        <SheetFooter className="px-4">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Multi-select attendee chips (Everyone + each person). Not the single-select rule-subject chips. */
function AttendeeChips({
  people,
  draft,
  houseCount,
  canEdit,
  adding,
  onToggle,
  onEveryone,
  onStartAdd,
}: {
  people: readonly TablePerson[];
  draft: NightPeopleDraft;
  houseCount: number;
  canEdit: boolean;
  adding: boolean;
  onToggle: (person: TablePerson) => void;
  onEveryone: () => void;
  onStartAdd: () => void;
}) {
  const everyoneOn = draftIsEveryone(draft, houseCount);
  return (
    <div data-slot="whos-eating-chips" className="flex flex-wrap gap-2">
      <Chip
        label={WHOS_EATING_EVERYONE}
        selected={everyoneOn}
        dashed
        disabled={!canEdit}
        onClick={onEveryone}
      />
      {people.map((person) => (
        <Chip
          key={person.key}
          label={person.name}
          selected={personIsSelected(draft, person)}
          disabled={!canEdit}
          onClick={() => onToggle(person)}
        />
      ))}
      {canEdit && !adding ? (
        <Chip label={ADD_NAME_LABEL} selected={false} dashed onClick={onStartAdd} />
      ) : null}
    </div>
  );
}

function Chip({
  label,
  selected,
  dashed = false,
  disabled = false,
  onClick,
}: {
  label: string;
  selected: boolean;
  dashed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
        dashed && !selected ? "border border-dashed border-border bg-card text-foreground" : null,
        selected
          ? "bg-primary text-primary-foreground"
          : !dashed
            ? "border border-border bg-card text-foreground"
            : null,
        disabled && "opacity-60",
      )}
    >
      {selected ? <Check className="size-4" aria-hidden /> : null}
      {label}
    </button>
  );
}

export function useOptionalSupper(): ReturnType<typeof useSupper> | null {
  try {
    return useSupper();
  } catch {
    return null;
  }
}

export function WhosEatingRow({
  weekday,
  names,
  everyone,
  rulesCount,
  onOpen,
}: {
  weekday: string;
  names: readonly string[];
  everyone: boolean;
  rulesCount: number;
  onOpen: () => void;
}) {
  const list = [...names];
  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        data-slot="whos-eating-row"
        aria-label={whosEatingRowAria(weekday, list, everyone)}
        onClick={onOpen}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] bg-muted px-3 py-2 text-left"
      >
        <span className="type-body text-muted-foreground" data-label={whosEatingRowLabel(list, everyone)}>
          {WHOS_EATING_LABEL}: <span className="font-semibold text-foreground">{whosEatingNamesLine(list, everyone)}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {!everyone && rulesCount > 0 ? (
        <p data-slot="whos-eating-night-rules" className="type-meta px-1 text-[#b45309]">
          {planningAroundRules(rulesCount)}
        </p>
      ) : null}
    </div>
  );
}

export function FoodRulesCoverageRow({
  reviewedAt,
  ruleCount,
}: {
  reviewedAt: string | null | undefined;
  ruleCount: number;
}) {
  if (ruleCount > 0) {
    return (
      <div
        data-slot="food-rules-coverage"
        className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-[#fff7ed] px-3 py-2"
      >
        <p className="type-body text-[#9a3412]">{`Planning around ${ruleCount} food ${ruleCount === 1 ? "rule" : "rules"}`}</p>
        <Link href="/settings/food-rules" className="type-body font-semibold text-primary">
          View
        </Link>
      </div>
    );
  }
  if (reviewedAt) return null;
  return (
    <div
      data-slot="food-rules-coverage"
      className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-[14px] bg-[#fff7ed] px-3 py-2"
    >
      <p className="type-body text-[#9a3412]">No food rules set up</p>
      <Link href="/settings/food-rules" className="type-body font-semibold text-primary">
        Add
      </Link>
    </div>
  );
}

export function WhosEatingSheet({
  open,
  weekday,
  people,
  memberships,
  eaters,
  rules,
  initial,
  plates,
  canEdit,
  mealText,
  onClose,
  onDone,
}: {
  open: boolean;
  weekday: string;
  people: readonly TablePerson[];
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  rules: readonly FoodRule[];
  initial: NightPeopleDraft;
  plates: number;
  canEdit: boolean;
  mealText?: string | null;
  onClose: () => void;
  onDone: (draft: NightPeopleDraft, plates: number) => void;
}) {
  const supper = useOptionalSupper();
  const houseCount = people.length;
  const writable = canEdit && canEditWhosEating(supper?.session?.role);
  const [draft, setDraft] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [confirms, setConfirms] = useState<AllergyConfirm[]>([]);
  if (pendingName) {
    const created = eaters.find((eater) => eater.displayName.toLowerCase() === pendingName.toLowerCase());
    if (created && !draft.everyone && !draft.eaterIds.includes(created.id)) {
      setDraft(
        collapseIfEveryone({ ...draft, eaterIds: [...draft.eaterIds, created.id] }, people.length),
      );
    }
    if (created) setPendingName(null);
  }
  const everyone = draftIsEveryone(draft, houseCount);
  const peopleCount = selectedPeopleCount(draft, houseCount);
  const nextPlates = platesForDraft(draft, houseCount, plates);
  const inScope = rulesInScopeForDraft(rules, draft, houseCount);
  const emptySelection = peopleCount <= 0;

  const commit = (next: NightPeopleDraft) => {
    const collapsed = collapseIfEveryone(next, houseCount);
    onDone(collapsed, platesForDraft(collapsed, houseCount, plates));
  };

  const requestDone = () => {
    if (!writable || emptySelection) return;
    const pending = allergyConfirmsOnRemove({
      previous: initial,
      next: draft,
      people,
      rules,
      weekday,
      mealText,
    });
    if (pending.length > 0) {
      setConfirms(pending);
      return;
    }
    commit(draft);
  };

  const confirm = confirms[0];
  const notEating = people.filter((person) => !personIsSelected(draft, person));
  const showRulesPanel = Boolean(mealText?.trim()) || rules.length > 0;

  return (
    <WhosEatingSheetShell
      open={open}
      title={whosEatingSheetTitle(weekday)}
      description={WHOS_EATING_HELPER}
      onClose={onClose}
      footer={
        <div className="flex w-full items-end justify-between gap-3">
          <div className="min-w-0">
            <p data-slot="whos-eating-footer-counts" className="type-body font-semibold">
              {footerPeoplePlatesLine({
                everyone,
                people: everyone ? houseCount : peopleCount,
                guests: everyone ? 0 : draft.guests,
                plates: nextPlates,
              })}
            </p>
            {inScope.length > 0 ? (
              <p data-slot="whos-eating-footer-rules" className="type-meta text-muted-foreground">
                {footerRulesLine(inScope, memberships, eaters)}
              </p>
            ) : null}
          </div>
          {writable ? (
            <Button
              type="button"
              variant="primary"
              size="fat"
              data-slot="whos-eating-done"
              className="shrink-0"
              disabled={emptySelection}
              onClick={requestDone}
            >
              {WHOS_EATING_DONE}
            </Button>
          ) : null}
        </div>
      }
    >
      {!writable ? (
        <p data-slot="whos-eating-readonly" className="type-meta text-muted-foreground">
          {WHOS_EATING_EATER_READONLY}
        </p>
      ) : null}
      <AttendeeChips
        people={people}
        draft={draft}
        houseCount={houseCount}
        canEdit={writable}
        adding={adding}
        onToggle={(person) => setDraft((current) => applyChipToggle(current, person, houseCount, plates))}
        onEveryone={() => setDraft(applyEveryoneChip(people, draft.guests))}
        onStartAdd={() => setAdding(true)}
      />
      {adding && writable ? (
        <AddNameInline
          existing={eaters}
          memberNames={memberships.map((member) => member.displayName)}
          defaultOpen
          fullWidth
          helper={WHOS_EATING_ADD_NAME_HELPER}
          placeholder={WHOS_EATING_ADD_NAME_PLACEHOLDER}
          onClose={() => setAdding(false)}
          onAdd={async (name) => {
            if (!supper) return;
            await supper.addEater(name);
            setPendingName(name);
          }}
        />
      ) : null}
      {writable ? (
        <div data-slot="whos-eating-guests" className="flex items-center justify-between gap-3">
          <div>
            <p className="type-body font-semibold">{WHOS_EATING_GUESTS_LABEL}</p>
            <p className="type-meta text-muted-foreground">{WHOS_EATING_GUESTS_HELPER}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Fewer guests on ${weekday}`}
              disabled={draft.guests <= 0}
              onClick={() => setDraft((current) => withNamedListGuests(current, current.guests - 1, houseCount))}
              className="tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40"
            >
              <Minus className="size-5" />
            </button>
            <span className="w-8 text-center font-mono text-lg font-semibold tabular-nums">{draft.guests}</span>
            <button
              type="button"
              aria-label={`More guests on ${weekday}`}
              disabled={namedListPlatesSafe(peopleCount, draft.guests) >= MAX_HEADCOUNT}
              onClick={() => setDraft((current) => withNamedListGuests(current, current.guests + 1, houseCount))}
              className="tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
      {showRulesPanel ? (
        <div data-slot="whos-eating-rules-panel" className="space-y-2">
          <p className="type-body font-semibold">{planningAroundRules(inScope.length)}</p>
          <ul className="space-y-1">
            {inScope.map((rule) => (
              <li key={rule.id} className="type-meta flex items-center justify-between gap-2">
                <span>
                  {rule.foodLabel} · {foodRuleWho(rule, memberships, eaters)}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5">{severityLabel(rule.severity)}</span>
              </li>
            ))}
          </ul>
          {notEating.map((person) => {
            const foods = rulesForPerson(rules, person).map((rule) => rule.foodLabel);
            if (foods.length === 0) return null;
            return (
              <p key={person.key} className="type-meta text-muted-foreground">
                {notApplyingLine(weekday, person.name, foods)}
              </p>
            );
          })}
          <Link href="/settings/food-rules" className="type-meta font-semibold text-primary">
            Food rules
          </Link>
        </div>
      ) : null}
      {emptySelection && writable ? (
        <p data-slot="whos-eating-need-person" className="type-meta text-destructive">
          {WHOS_EATING_NEED_PERSON}
        </p>
      ) : null}
      {confirm ? (
        <div
          data-slot="whos-eating-take-off"
          className="rounded-[14px] border border-border bg-card p-4 shadow-card"
          role="alertdialog"
          aria-labelledby="whos-eating-take-off-title"
        >
          <p id="whos-eating-take-off-title" className="type-body font-semibold">
            {takeOffTitle(confirm.name, confirm.weekday)}
          </p>
          <p className="type-body mt-2">
            {confirm.mealHitFood
              ? takeOffMealHitBody(
                  confirm.name,
                  confirm.weekday,
                  confirm.allergyFoods[0] ?? confirm.mealHitFood,
                  confirm.mealHitFood,
                )
              : takeOffBody(confirm.name, confirm.weekday, confirm.allergyFoods)}
          </p>
          <p className="type-meta mt-2 text-muted-foreground">{WHOS_EATING_CROSS_CONTACT}</p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="fat"
              className="flex-1"
              onClick={() => {
                const person = people.find((row) => row.key === confirm.key);
                if (person) setDraft((current) => applyChipToggle(current, person, houseCount, plates));
                setConfirms((queue) => queue.slice(1));
              }}
            >
              {WHOS_EATING_KEEP}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="fat"
              className="flex-1"
              onClick={() => {
                const rest = confirms.slice(1);
                setConfirms(rest);
                if (rest.length === 0) commit(draft);
              }}
            >
              {WHOS_EATING_TAKE_OFF}
            </Button>
          </div>
        </div>
      ) : null}
    </WhosEatingSheetShell>
  );
}

function namedListPlatesSafe(people: number, guests: number): number {
  return Math.max(0, people) + Math.max(0, guests);
}

export function featureFromSupper(supper: ReturnType<typeof useOptionalSupper>, schemaReady: boolean): boolean {
  if (!supper?.snapshot) return false;
  return showWhosEatingFeature({
    schemaReady,
    eaters: supper.snapshot.eaters,
    memberships: supper.snapshot.memberships,
  });
}

export { showWhosEatingFeature, showWhosEatingRow, whosEatingNamesLine };
