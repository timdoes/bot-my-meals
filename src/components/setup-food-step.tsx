"use client";

import { useMemo, useState } from "react";
import { Shield, X } from "lucide-react";
import {
  FoodPicker,
  FoodRuleSheet,
  PersonChips,
  personSelectionToDraft,
  type PersonSelection,
} from "@/components/food-rules";
import { SeverityPill } from "@/components/food-rules/severity-pill";
import { HouseCard } from "@/components/house-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADD_NAME_LABEL,
  allergenLabel,
  foodKeyFromLabel,
  foodRuleWho,
  normalizeFoodLabel,
  WHOLE_HOUSE_LABEL,
  type FoodRuleDraft,
} from "@/lib/food-rules";
import {
  HOUSE_SETUP_FOOD_ADD,
  HOUSE_SETUP_FOOD_ALLERGIES,
  HOUSE_SETUP_FOOD_DISLIKES,
  HOUSE_SETUP_FOOD_DISLIKES_PLACEHOLDER,
  HOUSE_SETUP_FOOD_ELSE_PLACEHOLDER,
  HOUSE_SETUP_FOOD_EVERYONE,
  HOUSE_SETUP_FOOD_NONE,
  HOUSE_SETUP_FOOD_SAFETY,
  HOUSE_SETUP_FOOD_WHO_LABEL,
} from "@/lib/house-setup";
import type { AllergenCode, FoodRule, HouseholdEater, Membership } from "@/lib/types";

export function SetupFoodStep({
  helper,
  memberships,
  eaters,
  rules,
  canAct,
  noneChecked,
  onNoneChecked,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onAddName,
}: {
  helper: string;
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  rules: readonly FoodRule[];
  canAct: boolean;
  noneChecked: boolean;
  onNoneChecked: (checked: boolean) => void;
  onAddRule: (draft: FoodRuleDraft) => void | Promise<void>;
  onUpdateRule: (ruleId: string, draft: FoodRuleDraft) => void | Promise<void>;
  onRemoveRule: (ruleId: string) => void | Promise<void>;
  onAddName: (name: string) => void | Promise<void>;
}) {
  const [who, setWho] = useState<PersonSelection>({ kind: "house" });
  const [allergyDraft, setAllergyDraft] = useState("");
  const [dislikeDraft, setDislikeDraft] = useState("");
  const [editing, setEditing] = useState<FoodRule | null>(null);

  const subjects = personSelectionToDraft(who);
  const selectedCodes = useMemo(
    () =>
      rules
        .filter(
          (rule) =>
            rule.severity === "allergy" &&
            rule.allergenCode &&
            (rule.subjectMembershipId ?? null) === subjects.subjectMembershipId &&
            (rule.subjectEaterId ?? null) === subjects.subjectEaterId,
        )
        .map((rule) => rule.allergenCode)
        .filter((code): code is AllergenCode => Boolean(code)),
    [rules, subjects.subjectEaterId, subjects.subjectMembershipId],
  );

  const addAllergy = (foodLabel: string, allergenCode: AllergenCode | null) => {
    const label = normalizeFoodLabel(foodLabel);
    if (!label) return;
    const key = foodKeyFromLabel(label);
    const exists = rules.some(
      (rule) =>
        rule.foodKey === key &&
        (rule.subjectMembershipId ?? null) === subjects.subjectMembershipId &&
        (rule.subjectEaterId ?? null) === subjects.subjectEaterId,
    );
    if (exists) return;
    void Promise.resolve(
      onAddRule({
        ...subjects,
        foodLabel: label,
        allergenCode,
        severity: "allergy",
      }),
    );
  };

  const toggleAllergen = (code: AllergenCode) => {
    const existing = rules.find(
      (rule) =>
        rule.allergenCode === code &&
        (rule.subjectMembershipId ?? null) === subjects.subjectMembershipId &&
        (rule.subjectEaterId ?? null) === subjects.subjectEaterId,
    );
    if (existing) {
      void Promise.resolve(onRemoveRule(existing.id));
      return;
    }
    addAllergy(allergenLabel(code), code);
  };

  const addDislikes = () => {
    const parts = dislikeDraft
      .split(",")
      .map((part) => normalizeFoodLabel(part))
      .filter(Boolean);
    if (!parts.length) return;
    for (const foodLabel of parts) {
      const key = foodKeyFromLabel(foodLabel);
      const exists = rules.some(
        (rule) =>
          rule.foodKey === key &&
          (rule.subjectMembershipId ?? null) === subjects.subjectMembershipId &&
          (rule.subjectEaterId ?? null) === subjects.subjectEaterId,
      );
      if (exists) continue;
      void Promise.resolve(
        onAddRule({
          ...subjects,
          foodLabel,
          allergenCode: null,
          severity: "dislike",
        }),
      );
    }
    setDislikeDraft("");
  };

  return (
    <div data-slot="setup-food-step" className="space-y-4">
      <p className="type-body text-muted-foreground">{helper}</p>
      <HouseCard className="flex gap-3 bg-secondary">
        <Shield className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="type-body text-foreground">{HOUSE_SETUP_FOOD_SAFETY}</p>
      </HouseCard>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          data-slot="setup-food-none"
          checked={noneChecked}
          disabled={!canAct}
          onChange={(event) => onNoneChecked(event.target.checked)}
          className="size-5 rounded border-border"
        />
        <span className="type-body">{HOUSE_SETUP_FOOD_NONE}</span>
      </label>

      {noneChecked ? null : (
        <>
          <PersonChips
            memberships={memberships}
            eaters={eaters}
            selected={who}
            onSelect={setWho}
            onAddName={canAct ? onAddName : undefined}
            disabled={!canAct}
            houseLabel={HOUSE_SETUP_FOOD_EVERYONE}
            addNameLabel={ADD_NAME_LABEL}
            label={HOUSE_SETUP_FOOD_WHO_LABEL}
          />

          <div className="space-y-2">
            <FoodPicker
              id="setup-food-allergy"
              value={allergyDraft}
              allergenCode={null}
              selectedCodes={selectedCodes}
              label={HOUSE_SETUP_FOOD_ALLERGIES}
              placeholder={HOUSE_SETUP_FOOD_ELSE_PLACEHOLDER}
              disabled={!canAct}
              onChange={({ foodLabel, allergenCode }) => {
                if (allergenCode && !foodLabel) {
                  toggleAllergen(allergenCode);
                  return;
                }
                if (allergenCode) {
                  toggleAllergen(allergenCode);
                  setAllergyDraft("");
                  return;
                }
                setAllergyDraft(foodLabel);
              }}
            />
            <div className="flex items-center justify-end">
              <Button
                type="button"
                size="fat"
                variant="outline"
                disabled={!canAct || !normalizeFoodLabel(allergyDraft)}
                onClick={() => {
                  addAllergy(allergyDraft, null);
                  setAllergyDraft("");
                }}
              >
                {HOUSE_SETUP_FOOD_ADD}
              </Button>
            </div>
          </div>

          {rules.length ? (
            <ul data-slot="setup-food-rules" className="space-y-2">
              {rules.map((rule) => {
                const whoLabel = foodRuleWho(rule, memberships, eaters);
                const displayWho = whoLabel === WHOLE_HOUSE_LABEL ? HOUSE_SETUP_FOOD_EVERYONE : whoLabel;
                return (
                  <li key={rule.id}>
                    <div className="flex min-h-11 items-center gap-2 rounded-[14px] bg-card px-4 shadow-card">
                      <button
                        type="button"
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setEditing(rule)}
                      >
                        <span className="type-body truncate">
                          {rule.foodLabel} · {displayWho}
                        </span>
                        <SeverityPill severity={rule.severity} />
                      </button>
                      {canAct ? (
                        <button
                          type="button"
                          aria-label={`Remove ${rule.foodLabel}`}
                          className="tap-target flex size-11 items-center justify-center text-destructive"
                          onClick={() => void Promise.resolve(onRemoveRule(rule.id))}
                        >
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="space-y-2">
            <p className="type-meta text-muted-foreground">{HOUSE_SETUP_FOOD_DISLIKES}</p>
            <div className="flex items-center gap-2">
              <Input
                id="setup-food-dislike"
                value={dislikeDraft}
                disabled={!canAct}
                placeholder={HOUSE_SETUP_FOOD_DISLIKES_PLACEHOLDER}
                maxLength={60}
                onChange={(event) => setDislikeDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDislikes();
                  }
                }}
                className="h-11 min-h-11 flex-1 rounded-[14px] px-4"
              />
              <Button
                type="button"
                size="fat"
                variant="outline"
                disabled={!canAct || !dislikeDraft.trim()}
                onClick={addDislikes}
              >
                {HOUSE_SETUP_FOOD_ADD}
              </Button>
            </div>
          </div>
        </>
      )}

      <FoodRuleSheet
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        rule={editing}
        memberships={memberships}
        eaters={eaters}
        rules={rules}
        canAct={canAct}
        onSave={(draft) => {
          if (!editing) return;
          void Promise.resolve(onUpdateRule(editing.id, draft));
          setEditing(null);
        }}
        onRemove={(rule) => {
          void Promise.resolve(onRemoveRule(rule.id));
          setEditing(null);
        }}
        onAddName={onAddName}
      />
    </div>
  );
}
