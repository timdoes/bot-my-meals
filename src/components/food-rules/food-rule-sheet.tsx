"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  FOOD_DETAILS_MAX,
  FOOD_RULE_CROSS_CONTACT,
  FOOD_RULE_SEVERITIES,
  foodKeyFromLabel,
  foodRuleAppliesLine,
  foodRuleWho,
  normalizeFoodLabel,
  severityLabel,
  WHOLE_HOUSE_LABEL,
} from "@/lib/food-rules";
import type { FoodRuleDraft } from "@/lib/food-rules";
import type { AllergenCode, FoodRule, FoodRuleSeverity, HouseholdEater, Membership } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ADD_FOOD_RULE_TITLE,
  alreadyOnList,
  CANCEL_LABEL,
  DETAILS_LABEL,
  DETAILS_PLACEHOLDER,
  DOWNGRADE_GUARD,
  EDIT_FOOD_RULE_TITLE,
  FOOD_RULES_SAFETY_SHORT,
  HOW_SERIOUS_LABEL,
  REMOVE_LABEL,
  SAVE_LABEL,
  SEVERITY_HELPERS,
  UPDATE_LABEL,
} from "./copy";
import { FoodPicker } from "./food-picker";
import {
  PersonChips,
  personSelectionFromIds,
  personSelectionToDraft,
  type PersonSelection,
} from "./person-chips";
import { severityPillClass } from "./severity-pill";

export type FoodRuleSheetMode = "add" | "edit";

function findDuplicate(
  rules: readonly FoodRule[],
  foodLabel: string,
  selection: PersonSelection,
  ignoreId?: string,
): FoodRule | undefined {
  const key = foodKeyFromLabel(foodLabel);
  if (!key) return undefined;
  const subjects = personSelectionToDraft(selection);
  return rules.find(
    (rule) =>
      rule.id !== ignoreId &&
      rule.foodKey === key &&
      (rule.subjectMembershipId ?? null) === subjects.subjectMembershipId &&
      (rule.subjectEaterId ?? null) === subjects.subjectEaterId,
  );
}

export function FoodRuleSheet({
  open,
  onOpenChange,
  mode,
  defaultSeverity = "allergy",
  defaultSubject,
  rule = null,
  memberships,
  eaters,
  rules,
  canAct,
  onSave,
  onRemove,
  onAddName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FoodRuleSheetMode;
  defaultSeverity?: FoodRuleSeverity;
  defaultSubject?: PersonSelection;
  rule?: FoodRule | null;
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  rules: readonly FoodRule[];
  canAct: boolean;
  onSave: (draft: FoodRuleDraft) => void | Promise<void>;
  onRemove?: (rule: FoodRule) => void | Promise<void>;
  onAddName?: (name: string) => void | Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open ? (
        <FoodRuleSheetForm
          key={rule?.id ?? `add:${defaultSeverity}`}
          mode={mode}
          defaultSeverity={defaultSeverity}
          defaultSubject={defaultSubject}
          rule={rule}
          memberships={memberships}
          eaters={eaters}
          rules={rules}
          canAct={canAct}
          onOpenChange={onOpenChange}
          onSave={onSave}
          onRemove={onRemove}
          onAddName={onAddName}
        />
      ) : null}
    </Sheet>
  );
}

function FoodRuleSheetForm({
  mode,
  defaultSeverity,
  defaultSubject,
  rule = null,
  memberships,
  eaters,
  rules,
  canAct,
  onOpenChange,
  onSave,
  onRemove,
  onAddName,
}: {
  mode: FoodRuleSheetMode;
  defaultSeverity: FoodRuleSeverity;
  defaultSubject?: PersonSelection;
  rule?: FoodRule | null;
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  rules: readonly FoodRule[];
  canAct: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: FoodRuleDraft) => void | Promise<void>;
  onRemove?: (rule: FoodRule) => void | Promise<void>;
  onAddName?: (name: string) => void | Promise<void>;
}) {
  const initialSeverity = rule?.severity ?? defaultSeverity;
  const [foodLabel, setFoodLabel] = useState(rule?.foodLabel ?? "");
  const [allergenCode, setAllergenCode] = useState<AllergenCode | null>(rule?.allergenCode ?? null);
  const [selection, setSelection] = useState<PersonSelection>(
    defaultSubject ?? personSelectionFromIds(rule?.subjectMembershipId, rule?.subjectEaterId),
  );
  const [severity, setSeverity] = useState<FoodRuleSeverity>(initialSeverity);
  const [details, setDetails] = useState(rule?.details ?? "");

  const who = useMemo(() => {
    const subjects = personSelectionToDraft(selection);
    return foodRuleWho(subjects, memberships, eaters);
  }, [selection, memberships, eaters]);

  const duplicate = findDuplicate(rules, foodLabel, selection, rule?.id);
  const foodReady = Boolean(normalizeFoodLabel(foodLabel));
  const saveLabel = duplicate || mode === "edit" ? UPDATE_LABEL : SAVE_LABEL;
  const showDowngrade = initialSeverity === "allergy" && severity !== "allergy";

  const close = () => onOpenChange(false);

  const save = () => {
    if (!foodReady || !canAct) return;
    const subjects = personSelectionToDraft(selection);
    const draft: FoodRuleDraft = {
      ...subjects,
      foodLabel: normalizeFoodLabel(foodLabel),
      allergenCode,
      severity,
      details: details.trim(),
    };
    void Promise.resolve(onSave(draft));
    close();
  };

  return (
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-[16px]">
        <SheetHeader>
          <SheetTitle className="type-section">
            {mode === "edit" ? EDIT_FOOD_RULE_TITLE : ADD_FOOD_RULE_TITLE}
          </SheetTitle>
        </SheetHeader>
        <div data-slot="food-rule-sheet" className="space-y-5 px-4">
          <FoodPicker
            value={foodLabel}
            allergenCode={allergenCode}
            disabled={!canAct}
            onChange={(next) => {
              setFoodLabel(next.foodLabel);
              setAllergenCode(next.allergenCode);
            }}
          />

          <PersonChips
            memberships={memberships}
            eaters={eaters}
            selected={selection}
            disabled={!canAct}
            onSelect={setSelection}
            onAddName={canAct ? onAddName : undefined}
          />

          <div className="space-y-2">
            <p className="type-meta text-muted-foreground">{HOW_SERIOUS_LABEL}</p>
            <div role="radiogroup" aria-label={HOW_SERIOUS_LABEL} className="flex flex-wrap gap-2">
              {FOOD_RULE_SEVERITIES.map((value) => {
                const active = severity === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!canAct}
                    data-slot="severity-choice"
                    data-severity={value}
                    onClick={() => setSeverity(value)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold",
                      active ? severityPillClass(value) : "border-border bg-card text-foreground",
                    )}
                  >
                    {severityLabel(value)}
                  </button>
                );
              })}
            </div>
            <p className="type-meta text-muted-foreground">{SEVERITY_HELPERS[severity]}</p>
            {showDowngrade ? <p className="type-meta text-swap">{DOWNGRADE_GUARD}</p> : null}
          </div>

          <p className="type-meta text-muted-foreground">{foodRuleAppliesLine(who)}</p>
          {who !== WHOLE_HOUSE_LABEL ? (
            <p className="type-meta text-muted-foreground">{FOOD_RULE_CROSS_CONTACT}</p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="food-rule-details" className="type-meta text-muted-foreground">
              {DETAILS_LABEL}
            </Label>
            <Input
              id="food-rule-details"
              value={details}
              disabled={!canAct}
              maxLength={FOOD_DETAILS_MAX}
              placeholder={DETAILS_PLACEHOLDER}
              onChange={(event) => setDetails(event.target.value)}
              className="h-11 min-h-11 rounded-[14px] px-4"
            />
          </div>

          {severity === "allergy" ? (
            <p className="type-meta text-muted-foreground">{FOOD_RULES_SAFETY_SHORT}</p>
          ) : null}

          {duplicate ? (
            <p data-slot="food-rule-duplicate" className="type-meta text-swap">
              {alreadyOnList(normalizeFoodLabel(foodLabel) || foodLabel, who)}
            </p>
          ) : null}
        </div>
        <SheetFooter className="flex-row gap-2">
          {mode === "edit" && rule && canAct && onRemove ? (
            <Button
              type="button"
              size="fat"
              variant="outline"
              className="text-destructive"
              onClick={() => {
                void Promise.resolve(onRemove(rule));
              }}
            >
              {REMOVE_LABEL}
            </Button>
          ) : (
            <Button type="button" size="fat" variant="outline" className="flex-1" onClick={close}>
              {CANCEL_LABEL}
            </Button>
          )}
          {mode === "edit" && rule && canAct && onRemove ? (
            <Button type="button" size="fat" variant="outline" className="flex-1" onClick={close}>
              {CANCEL_LABEL}
            </Button>
          ) : null}
          <Button
            type="button"
            size="fat"
            variant="primary"
            className="flex-1 shadow-float"
            disabled={!foodReady || !canAct}
            onClick={save}
          >
            {saveLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
  );
}
