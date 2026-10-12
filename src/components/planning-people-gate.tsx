"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PeoplePerNight } from "@/components/people-per-night";
import { Button } from "@/components/ui/button";
import {
  FoodRulesCoverageRow,
  WhosEatingRow,
  WhosEatingSheet,
  featureFromSupper,
  useOptionalSupper,
} from "@/components/whos-eating-sheet";
import { WEEKDAY_LABELS } from "@/lib/dates";
import {
  MAX_HEADCOUNT,
  MIN_NIGHT_HEADCOUNT,
  clampNightHeadcount,
  nightKindLabel,
  normalizeNightHeadcounts,
  withDerivedNightSettings,
} from "@/lib/headcount";
import { isFoodRulesSchemaReady } from "@/lib/supabase/missing-schema";
import {
  PLANNING_PEOPLE_BACK_LABEL,
  PLANNING_PEOPLE_HELPER,
  PLANNING_PEOPLE_NEED_NIGHT,
  PLANNING_PEOPLE_SAVE_LABEL,
  PLANNING_PEOPLE_TITLE,
  SPECIAL_INSTRUCTIONS_HELPER,
  SPECIAL_INSTRUCTIONS_LABEL,
  SPECIAL_INSTRUCTIONS_MAX,
  SPECIAL_INSTRUCTIONS_PLACEHOLDER,
  hasDinnerNight,
} from "@/lib/planning-people";
import type { NightPeopleInput } from "@/lib/food-rules";
import type { Household } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  WHOS_EATING_STEPPER_FLOOR,
  applyNamedListStepper,
  draftIsEveryone,
  draftsFromSnapshot,
  mealTextForNight,
  nightPeopleInputs,
  platesForDraft,
  rulesInScopeForDraft,
  selectedNames,
  selectedPeopleCount,
  showWhosEatingRow,
  tablePeople,
  weekCoverageRuleIds,
  type NightPeopleDraft,
} from "@/lib/whos-eating";

export function PlanningPeopleGate({
  household,
  canEdit,
  busy = false,
  initialCounts,
  initialInstructions = "",
  showInstructions = true,
  lockedWeekdays = [],
  cancelLabel = PLANNING_PEOPLE_BACK_LABEL,
  weekId,
  showCoverage = true,
  onSave,
  onBack,
}: {
  household: Household;
  canEdit: boolean;
  busy?: boolean;
  /** Week plates when reopening Edit nights. The empty gate uses House defaults. */
  initialCounts?: number[];
  initialInstructions?: string;
  showInstructions?: boolean;
  lockedWeekdays?: readonly number[];
  cancelLabel?: string;
  weekId?: string;
  showCoverage?: boolean;
  onSave: (
    counts: number[],
    instructions: string,
    attendees?: NightPeopleInput[] | null,
  ) => Promise<void>;
  onBack: () => void;
}) {
  const supper = useOptionalSupper();
  const featureOn = featureFromSupper(supper, isFoodRulesSchemaReady());
  const snapshot = supper?.snapshot ?? null;
  const people = tablePeople(snapshot?.memberships ?? [], snapshot?.eaters ?? []);
  const resolvedWeekId = weekId ?? snapshot?.planning?.week.id ?? null;
  const startCounts = initialCounts ?? household.nightHeadcounts;
  const [counts, setCounts] = useState(() => [...startCounts]);
  const [drafts, setDrafts] = useState<NightPeopleDraft[]>(() =>
    resolvedWeekId && snapshot
      ? draftsFromSnapshot({
          weekId: resolvedWeekId,
          people,
          lists: snapshot.nightLists,
          attendees: snapshot.nightAttendees,
          counts: startCounts,
        })
      : [0, 1, 2, 3, 4, 5, 6].map(() => ({
          everyone: true,
          membershipIds: people.filter((person) => person.kind === "member").map((person) => person.id),
          eaterIds: people.filter((person) => person.kind === "eater").map((person) => person.id),
          guests: 0,
        })),
  );
  const [instructions, setInstructions] = useState(initialInstructions);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const draftHousehold = withDerivedNightSettings(household, counts);
  const locked = busy || saving || !canEdit;
  const frozen = new Set(lockedWeekdays);
  const houseCount = people.length;
  const meals = resolvedWeekId && snapshot
    ? snapshot.week.id === resolvedWeekId
      ? snapshot.meals
      : (snapshot.planning?.week.id === resolvedWeekId ? snapshot.planning.meals : [])
    : [];
  const coverageIds = useMemo(
    () =>
      weekCoverageRuleIds({
        counts,
        drafts,
        rules: snapshot?.foodRules ?? [],
        houseCount,
      }),
    [counts, drafts, houseCount, snapshot?.foodRules],
  );

  const setNightCount = (weekday: number, value: number) => {
    if (frozen.has(weekday)) return;
    const draft = drafts[weekday];
    if (draft && !draftIsEveryone(draft, houseCount) && value !== (counts[weekday] ?? 0)) {
      const next = applyNamedListStepper(draft, houseCount, value);
      const nextCounts = [...counts];
      nextCounts[weekday] = next.plates;
      setCounts(nextCounts);
      setDrafts((current) => current.map((row, index) => (index === weekday ? next.draft : row)));
      return;
    }
    const next = [...counts];
    next[weekday] = clampNightHeadcount(value);
    setCounts(next);
  };

  const save = () => {
    if (!hasDinnerNight(counts)) {
      setError(PLANNING_PEOPLE_NEED_NIGHT);
      return;
    }
    setError(null);
    setSaving(true);
    const attendees = featureOn ? nightPeopleInputs(drafts, counts, houseCount) : null;
    const persist = async () => {
      if (featureOn && supper && attendees && !weekId) {
        await supper.savePlanningPeopleV2(counts, instructions, attendees);
      }
      await onSave(counts, instructions, attendees);
    };
    void persist()
      .catch((err: unknown) => {
        setError(err instanceof Error && err.message ? err.message : PLANNING_PEOPLE_NEED_NIGHT);
      })
      .finally(() => setSaving(false));
  };

  const instructionsField = showInstructions ? (
    <label className="mt-5 block" htmlFor="planning-special-instructions">
      <span className="type-body font-semibold">{SPECIAL_INSTRUCTIONS_LABEL}</span>
      <span className="type-meta mt-1 block text-muted-foreground">{SPECIAL_INSTRUCTIONS_HELPER}</span>
      <textarea
        id="planning-special-instructions"
        data-slot="special-instructions"
        rows={3}
        maxLength={SPECIAL_INSTRUCTIONS_MAX}
        placeholder={SPECIAL_INSTRUCTIONS_PLACEHOLDER}
        value={instructions}
        disabled={locked}
        onChange={(event) => setInstructions(event.target.value)}
        className="type-body mt-2 w-full resize-y rounded-[var(--radius-button)] border border-border bg-card px-3 py-2 text-foreground"
      />
    </label>
  ) : null;

  const openDraft = openDay == null ? null : drafts[openDay];

  return (
    <div data-slot="planning-people-gate">
      {featureOn && showCoverage ? (
        <FoodRulesCoverageRow
          reviewedAt={snapshot?.household.foodRulesReviewedAt}
          ruleCount={coverageIds.length}
        />
      ) : null}
      {featureOn ? (
        <section data-slot="house-card" className="rounded-[14px] bg-card p-5 shadow-card">
          <h2 className="type-section text-primary">{PLANNING_PEOPLE_TITLE}</h2>
          <p className="type-meta mt-1 text-muted-foreground">{PLANNING_PEOPLE_HELPER}</p>
          <ul data-slot="people-per-night" className="mt-4 space-y-2">
            {WEEKDAY_LABELS.map((label, weekday) => {
              const value = normalizeNightHeadcounts(counts)[weekday] ?? 0;
              const draft = drafts[weekday] ?? {
                everyone: true,
                membershipIds: [],
                eaterIds: [],
                guests: 0,
              };
              const named = !draftIsEveryone(draft, houseCount);
              const peopleOnNight = selectedPeopleCount(draft, houseCount);
              const floor = named ? peopleOnNight : MIN_NIGHT_HEADCOUNT;
              const minusBlocked = named && draft.guests <= 0 && value > 0;
              return (
                <li key={label} className="space-y-0">
                  <div
                    data-slot="night-stepper"
                    data-day={weekday}
                    data-frozen={frozen.has(weekday) ? "true" : "false"}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-secondary px-3 py-2"
                  >
                    <div>
                      <p className="type-body font-semibold">{label}</p>
                      <p className="type-meta text-muted-foreground">{nightKindLabel(value)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Fewer people on ${label}`}
                        disabled={locked || frozen.has(weekday) || value <= floor || minusBlocked}
                        onClick={() => setNightCount(weekday, value - 1)}
                        className={cn(
                          "tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40",
                        )}
                      >
                        <Minus className="size-5" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={named ? peopleOnNight : MIN_NIGHT_HEADCOUNT}
                        max={MAX_HEADCOUNT}
                        disabled={locked || frozen.has(weekday)}
                        value={value}
                        onChange={(event) => setNightCount(weekday, Number(event.target.value))}
                        aria-label={`People on ${label}`}
                        className="h-12 w-14 rounded-[var(--radius-button)] border border-border bg-card text-center font-mono text-lg font-semibold tabular-nums"
                      />
                      <button
                        type="button"
                        aria-label={`More people on ${label}`}
                        disabled={locked || frozen.has(weekday) || value >= MAX_HEADCOUNT}
                        onClick={() => setNightCount(weekday, value + 1)}
                        className="tap-target flex size-12 items-center justify-center rounded-[var(--radius-button)] bg-card text-foreground shadow-card disabled:opacity-40"
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>
                  </div>
                  {showWhosEatingRow(featureOn, value, frozen.has(weekday)) ? (
                    <WhosEatingRow
                      weekday={label}
                      names={selectedNames(draft, people)}
                      everyone={draftIsEveryone(draft, houseCount)}
                      rulesCount={rulesInScopeForDraft(snapshot?.foodRules ?? [], draft, houseCount).length}
                      onOpen={() => setOpenDay(weekday)}
                    />
                  ) : null}
                  {minusBlocked ? (
                    <p data-slot="whos-eating-stepper-floor" className="type-meta px-1 text-muted-foreground">
                      {WHOS_EATING_STEPPER_FLOOR}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {instructionsField}
        </section>
      ) : (
        <PeoplePerNight
          household={draftHousehold}
          canEdit={!locked}
          title={PLANNING_PEOPLE_TITLE}
          helper={PLANNING_PEOPLE_HELPER}
          compactOffNights={false}
          className="mt-0"
          lockedWeekdays={lockedWeekdays}
          onChange={(patch) => {
            if (patch.nightHeadcounts) setCounts(patch.nightHeadcounts);
          }}
        >
          {instructionsField}
        </PeoplePerNight>
      )}
      {error ? (
        <p data-slot="planning-people-error" className="type-meta mt-3 text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="fat"
        data-slot="planning-people-save"
        className="mt-4 w-full"
        disabled={locked}
        aria-busy={saving || busy}
        onClick={save}
      >
        {saving || busy ? "Saving…" : PLANNING_PEOPLE_SAVE_LABEL}
      </Button>
      <button
        type="button"
        data-slot="planning-people-back"
        className="type-meta mt-2 inline-flex min-h-12 w-full items-center justify-center font-semibold text-primary"
        onClick={onBack}
      >
        {cancelLabel}
      </button>
      {featureOn && openDay != null && openDraft ? (
        <WhosEatingSheet
          open
          weekday={WEEKDAY_LABELS[openDay] ?? ""}
          people={people}
          memberships={snapshot?.memberships ?? []}
          eaters={snapshot?.eaters ?? []}
          rules={snapshot?.foodRules ?? []}
          initial={openDraft}
          plates={counts[openDay] ?? 0}
          canEdit={!locked}
          mealText={mealTextForNight(meals, openDay)}
          onClose={() => setOpenDay(null)}
          onDone={(next, nextPlates) => {
            setDrafts((current) => current.map((row, index) => (index === openDay ? next : row)));
            setCounts((current) => {
              const updated = [...current];
              updated[openDay] = nextPlates;
              return updated;
            });
            setOpenDay(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function platesFromDrafts(
  drafts: readonly NightPeopleDraft[],
  counts: readonly number[],
  houseCount: number,
): number[] {
  return counts.map((count, index) => {
    const draft = drafts[index];
    if (!draft || count <= 0) return count;
    return platesForDraft(draft, houseCount, count);
  });
}
