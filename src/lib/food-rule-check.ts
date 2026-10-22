import { weekdayLabelFromNight, weekdayShortFromNight } from "./dates";
import { ruleHit } from "./food-rule-match";
import {
  FOOD_HOLD_ACK,
  FOOD_HOLD_ASK,
  FOOD_RULE_CHECK_LABEL,
  FOOD_RULE_CHECK_LINE,
  FOOD_RULE_CONFLICTS,
  FOOD_RULE_NEEDS_CHANGE,
  WHOLE_HOUSE_LABEL,
  foodHoldBanner,
  foodRuleOnList,
  foodRuleWho,
} from "./food-rules";
import { isNightOff } from "./lock";
import type {
  FoodRule,
  FoodRuleSeverity,
  HouseholdSnapshot,
  Meal,
  Recipe,
  WeekNightAttendee,
} from "./types";

export {
  FOOD_HOLD_ACK,
  FOOD_HOLD_ASK,
  FOOD_RULE_CHECK_LABEL,
  FOOD_RULE_CHECK_LINE,
  FOOD_RULE_CONFLICTS,
  FOOD_RULE_NEEDS_CHANGE,
  foodHoldBanner,
};

export const FOOD_RULE_NEEDS_CHANGE_CODE = "food_rule_needs_change";
export const FOOD_RULE_CONFLICT_CODE = "food_rule_conflict";
export const FOOD_RULE_HEADS_UP_ELSE = "Request something else";
export const FOOD_RULE_HEADS_UP_ANYWAY = "Request anyway";
export const FOOD_RULE_COOK_CHECK = "Check labels before cooking.";
export const FOOD_RULE_HAS_PREFIX = "Has ";

export type FoodRuleHit = {
  ruleId: string;
  foodLabel: string;
  foodKey: string;
  severity: FoodRuleSeverity;
  who: string;
  matchedTerm: string;
};

export type RecipeHoldView = {
  food: string;
  who: string;
  banner: string;
  body: string;
  holdIds: string[];
};

/** Live-safety: no rules and no holds → the app stays as it is today. */
export function hasFoodRuleUi(
  snapshot: Pick<HouseholdSnapshot, "foodRules" | "foodHolds"> | null | undefined,
): boolean {
  return Boolean(snapshot && (snapshot.foodRules.length > 0 || snapshot.foodHolds.length > 0));
}

export function foodRulesForNight(
  snapshot: Pick<HouseholdSnapshot, "foodRules" | "nightAttendees">,
  weekId: string,
  dayIndex: number,
): FoodRule[] {
  const rules = snapshot.foodRules;
  if (rules.length === 0) return [];
  const attendees = snapshot.nightAttendees.filter(
    (row) => row.weekId === weekId && row.dayIndex === dayIndex,
  );
  return rules.filter((rule) => ruleAppliesToNight(rule, attendees));
}

function ruleAppliesToNight(rule: FoodRule, attendees: readonly WeekNightAttendee[]): boolean {
  if (!rule.subjectMembershipId && !rule.subjectEaterId) return true;
  if (attendees.length === 0) return true;
  return attendees.some((row) =>
    rule.subjectMembershipId
      ? row.membershipId === rule.subjectMembershipId
      : Boolean(rule.subjectEaterId && row.eaterId === rule.subjectEaterId),
  );
}

function toHit(
  rule: FoodRule,
  snapshot: Pick<HouseholdSnapshot, "memberships" | "eaters">,
  matchedTerm: string,
): FoodRuleHit {
  return {
    ruleId: rule.id,
    foodLabel: rule.foodLabel,
    foodKey: rule.foodKey,
    severity: rule.severity,
    who: foodRuleWho(rule, snapshot.memberships, snapshot.eaters),
    matchedTerm,
  };
}

function severityRank(severity: FoodRuleSeverity): number {
  switch (severity) {
    case "allergy":
      return 0;
    case "intolerance":
      return 1;
    case "dislike":
      return 2;
    default: {
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

export function sortFoodRuleHits(hits: readonly FoodRuleHit[]): FoodRuleHit[] {
  return [...hits].sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity !== 0) return severity;
    return a.foodLabel.localeCompare(b.foodLabel) || a.ruleId.localeCompare(b.ruleId);
  });
}

export function allergyHits(hits: readonly FoodRuleHit[]): FoodRuleHit[] {
  return hits.filter((hit) => hit.severity === "allergy");
}

export function mealsForWeek(snapshot: HouseholdSnapshot, weekId: string): Meal[] {
  if (snapshot.week.id === weekId) return snapshot.meals;
  if (snapshot.planning?.week.id === weekId) return snapshot.planning.meals;
  return [];
}

export function findMealById(snapshot: HouseholdSnapshot, mealId: string): Meal | undefined {
  return snapshot.meals.find((meal) => meal.id === mealId)
    ?? snapshot.planning?.meals.find((meal) => meal.id === mealId);
}

export function findMealForDayName(
  snapshot: HouseholdSnapshot,
  dayName: string,
  preferWeekId?: string,
): Meal | undefined {
  const name = dayName.trim().toLowerCase();
  if (!name) return undefined;
  const pools: Meal[][] = [];
  if (preferWeekId) pools.push(mealsForWeek(snapshot, preferWeekId));
  if (!preferWeekId || preferWeekId !== snapshot.week.id) pools.push(snapshot.meals);
  if (snapshot.planning && preferWeekId !== snapshot.planning.week.id) {
    pools.push(snapshot.planning.meals);
  }
  for (const meals of pools) {
    const found = meals.find((meal) => {
      const full = weekdayLabelFromNight(meal.nightDate).toLowerCase();
      const short = weekdayShortFromNight(meal.nightDate).toLowerCase();
      return name === full || name === short || name.startsWith(`${short} `) || name.startsWith(`${full} `);
    });
    if (found) return found;
  }
  return undefined;
}

/**
 * Ballot / lock matcher. Allergy checks title + pitch; intolerance and dislike
 * check the title only — same split as `private.reject_food_rule_meal`.
 */
export function mealRuleHits(
  snapshot: HouseholdSnapshot,
  meal: Pick<Meal, "id" | "weekId" | "dayIndex" | "title" | "pitch">,
): FoodRuleHit[] {
  if (!hasFoodRuleUi(snapshot)) return [];
  if (!meal.title.trim()) return [];
  if (isNightOff(meal.id, snapshot.votes, snapshot.memberships)) return [];
  const rules = foodRulesForNight(snapshot, meal.weekId, meal.dayIndex);
  if (rules.length === 0) return [];
  const titlePitch = `${meal.title} ${meal.pitch}`;
  const hits: FoodRuleHit[] = [];
  for (const rule of rules) {
    const text = rule.severity === "allergy" ? titlePitch : meal.title;
    const term = ruleHit(rule, text);
    if (!term) continue;
    hits.push(toHit(rule, snapshot, term));
  }
  return sortFoodRuleHits(hits);
}

export function cardFoodRuleHits(snapshot: HouseholdSnapshot, meal: Meal): {
  allergy: FoodRuleHit | null;
  intolerance: FoodRuleHit | null;
} {
  const hits = mealRuleHits(snapshot, meal);
  return {
    allergy: hits.find((hit) => hit.severity === "allergy") ?? null,
    intolerance: hits.find((hit) => hit.severity === "intolerance") ?? null,
  };
}

export function weekAllergyLockHits(
  snapshot: HouseholdSnapshot,
  weekId: string,
  todayIso?: string,
): FoodRuleHit[] {
  if (!hasFoodRuleUi(snapshot)) return [];
  return mealsForWeek(snapshot, weekId)
    .filter((meal) => (todayIso ? meal.nightDate >= todayIso : true))
    .flatMap((meal) => allergyHits(mealRuleHits(snapshot, meal)));
}

export function foodRuleChipLabel(hit: FoodRuleHit): string {
  switch (hit.severity) {
    case "allergy":
      return hit.who === WHOLE_HOUSE_LABEL
        ? `${hit.foodLabel} \u00b7 ${WHOLE_HOUSE_LABEL}`
        : `${hit.foodLabel} \u00b7 ${hit.who}\u2019s allergy`;
    case "intolerance":
      return hit.who === WHOLE_HOUSE_LABEL
        ? `${hit.foodLabel} \u00b7 ${WHOLE_HOUSE_LABEL}`
        : `${hit.foodLabel} \u00b7 ${hit.who}`;
    case "dislike":
      return `${FOOD_RULE_HAS_PREFIX}${hit.foodLabel}`;
    default: {
      const _exhaustive: never = hit.severity;
      return _exhaustive;
    }
  }
}

export function foodRuleHeadsUpLine(hit: FoodRuleHit): string {
  const list = hit.severity === "allergy" ? "allergy list" : "list";
  if (hit.who === WHOLE_HOUSE_LABEL) {
    return `Heads up: ${hit.foodLabel} is on the ${WHOLE_HOUSE_LABEL} ${list}.`;
  }
  return `Heads up: ${hit.foodLabel} is on ${hit.who}\u2019s ${list}.`;
}

export function headsUpForText(
  snapshot: HouseholdSnapshot,
  weekId: string,
  dayIndex: number,
  text: string,
): FoodRuleHit | null {
  if (!hasFoodRuleUi(snapshot)) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const hits: FoodRuleHit[] = [];
  for (const rule of foodRulesForNight(snapshot, weekId, dayIndex)) {
    const term = ruleHit(rule, trimmed);
    if (term) hits.push(toHit(rule, snapshot, term));
  }
  return sortFoodRuleHits(hits)[0] ?? null;
}

export function foodRuleSwapNote(food: string): string {
  return `Allergy: ${food}`;
}

function recipeMatchText(meal: Pick<Meal, "title">, recipe: Recipe): { title: string; ingredients: string[] } {
  return {
    title: meal.title,
    ingredients: recipe.ingredients.map((item) => item.name),
  };
}

function firstRecipeRuleHit(rule: FoodRule, meal: Pick<Meal, "title">, recipe: Recipe): string | null {
  const text = recipeMatchText(meal, recipe);
  return ruleHit(rule, text.title)
    ?? text.ingredients.reduce<string | null>((found, name) => found ?? ruleHit(rule, name), null);
}

export function recipeHoldView(
  snapshot: HouseholdSnapshot,
  recipe: Recipe,
): RecipeHoldView | null {
  if (!hasFoodRuleUi(snapshot)) return null;
  const meal = findMealById(snapshot, recipe.mealId);
  if (!meal) return null;
  const open = meal.weekId === snapshot.week.id || meal.weekId === snapshot.planning?.week.id;
  if (!open) return null;

  const holds = snapshot.foodHolds.filter((hold) => hold.recipeId === recipe.id);
  const unacked = holds.filter((hold) => !hold.acknowledgedAt);
  if (holds.length > 0 && unacked.length === 0) return null;

  const rules = foodRulesForNight(snapshot, meal.weekId, meal.dayIndex).filter(
    (rule) => rule.severity === "allergy",
  );
  const matched = rules
    .map((rule) => {
      const term = firstRecipeRuleHit(rule, meal, recipe);
      return term ? toHit(rule, snapshot, term) : null;
    })
    .filter((hit): hit is FoodRuleHit => Boolean(hit));

  if (unacked.length === 0 && matched.length === 0) return null;

  const fromHold = unacked[0]
    ? snapshot.foodRules.find((rule) => rule.id === unacked[0]?.ruleId)
    : undefined;
  const hit = fromHold ? toHit(fromHold, snapshot, unacked[0]?.matchedTerm ?? fromHold.foodKey) : matched[0];
  if (!hit) return null;

  return {
    food: hit.foodLabel,
    who: hit.who,
    banner: foodHoldBanner(hit.foodLabel),
    body: foodHoldBody(hit.who),
    holdIds: unacked.map((hold) => hold.id),
  };
}

export function foodHoldBody(who: string): string {
  const onList =
    who === WHOLE_HOUSE_LABEL ? `On the ${WHOLE_HOUSE_LABEL} allergy list.` : foodRuleOnList(who);
  return `${onList} ${FOOD_RULE_COOK_CHECK}`;
}

export function recipeSoftHits(
  snapshot: HouseholdSnapshot,
  recipe: Recipe,
): { intolerances: FoodRuleHit[]; dislikes: FoodRuleHit[] } {
  if (!hasFoodRuleUi(snapshot)) return { intolerances: [], dislikes: [] };
  const meal = findMealById(snapshot, recipe.mealId);
  if (!meal) return { intolerances: [], dislikes: [] };
  const hits: FoodRuleHit[] = [];
  for (const rule of foodRulesForNight(snapshot, meal.weekId, meal.dayIndex)) {
    if (rule.severity === "allergy") continue;
    const term = firstRecipeRuleHit(rule, meal, recipe);
    if (term) hits.push(toHit(rule, snapshot, term));
  }
  const sorted = sortFoodRuleHits(hits);
  return {
    intolerances: sorted.filter((hit) => hit.severity === "intolerance"),
    dislikes: sorted.filter((hit) => hit.severity === "dislike"),
  };
}

export function nightHasSafetyRules(
  snapshot: HouseholdSnapshot,
  weekId: string,
  dayIndex: number,
): boolean {
  return foodRulesForNight(snapshot, weekId, dayIndex).some(
    (rule) => rule.severity === "allergy" || rule.severity === "intolerance",
  );
}

export function shoppingItemCheckTone(
  snapshot: HouseholdSnapshot,
  weekId: string,
  itemName: string,
): "allergy" | "intolerance" | null {
  if (!hasFoodRuleUi(snapshot)) return null;
  let allergy = false;
  let intolerance = false;
  for (const meal of mealsForWeek(snapshot, weekId)) {
    if (!meal.title.trim() || isNightOff(meal.id, snapshot.votes, snapshot.memberships)) continue;
    for (const rule of foodRulesForNight(snapshot, meal.weekId, meal.dayIndex)) {
      if (rule.severity === "dislike") continue;
      if (!ruleHit(rule, itemName)) continue;
      if (rule.severity === "allergy") allergy = true;
      else intolerance = true;
    }
  }
  if (allergy) return "allergy";
  if (intolerance) return "intolerance";
  return null;
}

export function weekShowsAllergenCheckLine(snapshot: HouseholdSnapshot, weekId: string): boolean {
  if (!hasFoodRuleUi(snapshot)) return false;
  return mealsForWeek(snapshot, weekId).some((meal) => {
    if (!meal.title.trim() || isNightOff(meal.id, snapshot.votes, snapshot.memberships)) return false;
    return foodRulesForNight(snapshot, meal.weekId, meal.dayIndex).some((rule) => rule.severity === "allergy");
  });
}

export function savedMealFoodRuleConflict(snapshot: HouseholdSnapshot, title: string): boolean {
  if (!hasFoodRuleUi(snapshot)) return false;
  const nights = [
    ...snapshot.meals,
    ...(snapshot.planning?.meals ?? []),
  ].filter((meal) => meal.title.trim() && !isNightOff(meal.id, snapshot.votes, snapshot.memberships));
  if (nights.length === 0) {
    return snapshot.foodRules.some(
      (rule) => rule.severity === "allergy" && ruleHit(rule, title) != null,
    );
  }
  return nights.some((meal) =>
    foodRulesForNight(snapshot, meal.weekId, meal.dayIndex).some(
      (rule) => rule.severity === "allergy" && ruleHit(rule, title) != null,
    ),
  );
}

export function reorderFoodRuleConflict(
  snapshot: HouseholdSnapshot,
  sourceId: string,
  targetId: string,
): FoodRuleHit | null {
  if (!hasFoodRuleUi(snapshot)) return null;
  const source = findMealById(snapshot, sourceId);
  const target = findMealById(snapshot, targetId);
  if (!source || !target) return null;
  const ontoTarget = allergyHits(
    mealRuleHits(snapshot, { ...target, title: source.title, pitch: source.pitch }),
  )[0];
  if (ontoTarget) return ontoTarget;
  return allergyHits(
    mealRuleHits(snapshot, { ...source, title: target.title, pitch: target.pitch }),
  )[0] ?? null;
}
