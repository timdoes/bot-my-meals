"use client";

import { useState } from "react";
import { Shield } from "lucide-react";
import { NeverAgainList } from "@/components/never-again-list";
import { BallotToast } from "@/components/ballot-toast";
import { HouseCard } from "@/components/house-card";
import { Button } from "@/components/ui/button";
import { FOOD_RULES_NONE, FOOD_RULES_TITLE, groupFoodRules, type FoodRuleDraft } from "@/lib/food-rules";
import { neverAgainMeals } from "@/lib/meal-dislikes";
import type { FoodRule, FoodRuleSeverity, HouseholdEater, MealDislike, Membership } from "@/lib/types";
import {
  ADD_ALLERGY_LABEL,
  ADD_FOOD_TO_SKIP_LABEL,
  ADD_ONE_LABEL,
  ADDED_TOAST,
  ALLERGY_SAFETY_SESSION_KEY,
  EATER_CHANGE_LINE,
  EMPTY_RULES_BODY,
  EMPTY_RULES_TITLE,
  FOOD_RULES_HELPER,
  FOOD_RULES_SAFETY_CARD,
  FOOD_RULES_SAFETY_SHORT,
  MEALS_SECTION_HELPER,
  MEALS_SECTION_TITLE,
  mealsCountLabel,
  REMOVED_TOAST,
  SAVED_TOAST,
} from "./copy";
import { FoodRuleSheet } from "./food-rule-sheet";
import { PeopleAtTheTable } from "./people-at-the-table";
import { personSelectionFromIds, type PersonSelection } from "./person-chips";
import { RemoveAllergyDialog } from "./remove-allergy-dialog";
import { SeverityPill } from "./severity-pill";

function allergySafetySeen(): boolean {
  try {
    return sessionStorage.getItem(ALLERGY_SAFETY_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

function markAllergySafetySeen() {
  try {
    sessionStorage.setItem(ALLERGY_SAFETY_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function FoodRulesHome({
  rules,
  eaters,
  memberships,
  mealDislikes,
  reviewedAt,
  sessionMembershipId,
  canAct,
  lastAttendeeEaterId,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onAddEater,
  onRenameEater,
  onRemoveEater,
  onAllowMeal,
  onMarkReviewed,
}: {
  rules: readonly FoodRule[];
  eaters: readonly HouseholdEater[];
  memberships: readonly Membership[];
  mealDislikes: readonly MealDislike[];
  reviewedAt: string | null | undefined;
  sessionMembershipId?: string | null;
  canAct: boolean;
  lastAttendeeEaterId?: string | null;
  onAddRule: (draft: FoodRuleDraft) => void | Promise<void>;
  onUpdateRule: (ruleId: string, draft: FoodRuleDraft) => void | Promise<void>;
  onRemoveRule: (ruleId: string) => void | Promise<void>;
  onAddEater: (name: string) => void | Promise<void>;
  onRenameEater: (eaterId: string, name: string) => void | Promise<void>;
  onRemoveEater: (eaterId: string) => void | Promise<void>;
  onAllowMeal: (recipeKey: string) => void | Promise<void>;
  onMarkReviewed?: () => void | Promise<void>;
}) {
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "add" | "edit";
    severity: FoodRuleSeverity;
    subject?: PersonSelection;
    rule?: FoodRule | null;
  }>({ open: false, mode: "add", severity: "allergy", rule: null });
  const [pendingAllergy, setPendingAllergy] = useState<FoodRule | null>(null);
  const [toast, setToast] = useState<string | undefined>();

  const groups = groupFoodRules(rules, memberships, eaters);
  const meals = neverAgainMeals(mealDislikes);
  const reviewed = Boolean(reviewedAt);

  const openAdd = (severity: FoodRuleSeverity, subject?: PersonSelection) => {
    setSheet({ open: true, mode: "add", severity, subject, rule: null });
  };

  const rememberReview = () => {
    if (!reviewed && onMarkReviewed) void Promise.resolve(onMarkReviewed());
  };

  const afterAllergyAdd = (severity: FoodRuleSeverity) => {
    if (severity !== "allergy") {
      setToast(ADDED_TOAST);
      return;
    }
    if (allergySafetySeen()) {
      setToast(ADDED_TOAST);
      return;
    }
    markAllergySafetySeen();
    setToast(FOOD_RULES_SAFETY_SHORT);
  };

  const saveDraft = (draft: FoodRuleDraft) => {
    const editing = sheet.mode === "edit" ? sheet.rule : null;
    if (editing) {
      void Promise.resolve(onUpdateRule(editing.id, draft));
      setToast(SAVED_TOAST);
      return;
    }
    void Promise.resolve(onAddRule(draft));
    rememberReview();
    afterAllergyAdd(draft.severity);
  };

  const requestRemove = (rule: FoodRule) => {
    setSheet((current) => ({ ...current, open: false }));
    if (rule.severity === "allergy") {
      setPendingAllergy(rule);
      return;
    }
    void Promise.resolve(onRemoveRule(rule.id));
    setToast(REMOVED_TOAST);
  };

  return (
    <div data-slot="food-rules-home" className="space-y-6">
      <p className="type-body text-muted-foreground">{FOOD_RULES_HELPER}</p>
      {canAct ? null : <p className="type-meta text-muted-foreground">{EATER_CHANGE_LINE}</p>}

      <HouseCard className="flex gap-3 bg-secondary">
        <Shield className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="type-body text-foreground">{FOOD_RULES_SAFETY_CARD}</p>
      </HouseCard>

      {canAct ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="fat" variant="primary" onClick={() => openAdd("allergy")}>
            {ADD_ALLERGY_LABEL}
          </Button>
          <Button type="button" size="fat" variant="outline" onClick={() => openAdd("dislike")}>
            {ADD_FOOD_TO_SKIP_LABEL}
          </Button>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <div data-slot="food-rules-empty" className="space-y-2">
          {reviewed ? (
            <p className="type-body text-muted-foreground">
              {FOOD_RULES_NONE}
              {canAct ? (
                <>
                  {" "}
                  <button type="button" className="font-semibold text-primary" onClick={() => openAdd("allergy")}>
                    {ADD_ONE_LABEL}
                  </button>
                </>
              ) : null}
            </p>
          ) : (
            <>
              <p className="type-section">{EMPTY_RULES_TITLE}</p>
              <p className="type-body text-muted-foreground">{EMPTY_RULES_BODY}</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} data-slot="food-rule-group">
              <h2 className="type-eyebrow text-muted-foreground">{group.who}</h2>
              <HouseCard className="mt-2 p-0">
                <ul>
                  {group.rules.map((rule) => (
                    <li key={rule.id} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        data-slot="food-rule-row"
                        disabled={!canAct}
                        onClick={() =>
                          setSheet({
                            open: true,
                            mode: "edit",
                            severity: rule.severity,
                            rule,
                            subject: personSelectionFromIds(rule.subjectMembershipId, rule.subjectEaterId),
                          })
                        }
                        className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 text-left"
                      >
                        <span className="type-body font-semibold">{rule.foodLabel}</span>
                        <SeverityPill severity={rule.severity} />
                      </button>
                    </li>
                  ))}
                </ul>
              </HouseCard>
            </section>
          ))}
        </div>
      )}

      <section id="meals" data-slot="food-rules-meals" className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="type-section text-primary">{MEALS_SECTION_TITLE}</h2>
          <p className="type-meta text-muted-foreground">{mealsCountLabel(meals.length)}</p>
        </div>
        <p className="type-meta text-muted-foreground">{MEALS_SECTION_HELPER}</p>
        <NeverAgainList
          rows={[...mealDislikes]}
          canAct={canAct}
          onAllow={async (recipeKey) => {
            await onAllowMeal(recipeKey);
          }}
        />
      </section>

      <PeopleAtTheTable
        memberships={memberships}
        eaters={eaters}
        rules={rules}
        sessionMembershipId={sessionMembershipId}
        canAct={canAct}
        lastAttendeeEaterId={lastAttendeeEaterId}
        onAddName={onAddEater}
        onRename={onRenameEater}
        onRemove={onRemoveEater}
      />

      <FoodRuleSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        mode={sheet.mode}
        defaultSeverity={sheet.severity}
        defaultSubject={sheet.subject}
        rule={sheet.rule}
        memberships={memberships}
        eaters={eaters}
        rules={rules}
        canAct={canAct}
        onSave={saveDraft}
        onRemove={requestRemove}
        onAddName={onAddEater}
      />

      <RemoveAllergyDialog
        open={pendingAllergy != null}
        food={pendingAllergy?.foodLabel ?? ""}
        onKeep={() => setPendingAllergy(null)}
        onRemove={() => {
          if (!pendingAllergy) return;
          void Promise.resolve(onRemoveRule(pendingAllergy.id));
          setPendingAllergy(null);
          setToast(REMOVED_TOAST);
        }}
      />

      <BallotToast message={toast} onDismiss={() => setToast(undefined)} />
      <span className="sr-only">{FOOD_RULES_TITLE}</span>
    </div>
  );
}
