import { foodRuleCounts, FOOD_RULES_NONE, FOOD_RULES_NOT_SET_UP } from "@/lib/food-rules";
import type { FoodRule, FoodRuleSeverity } from "@/lib/types";

/** Spec §9 / WHOS-EATING §5 strings that F0 did not export. */

export const FOOD_RULES_HELPER = "Your Bot plans every dinner around these.";
export const FOOD_RULES_SAFETY_CARD =
  "Allergies are avoided completely, including traces and cross-contact. We can\u2019t guarantee a meal is safe. Check labels and ingredients.";
export const FOOD_RULES_SAFETY_SHORT =
  "Can\u2019t guarantee a meal is safe. Check labels and ingredients.";
export const ADD_ALLERGY_LABEL = "Add allergy";
export const ADD_FOOD_TO_SKIP_LABEL = "Add a food to skip";
export const ADD_FOOD_RULE_TITLE = "Add a food rule";
export const EDIT_FOOD_RULE_TITLE = "Edit food rule";
export const FOOD_FIELD_LABEL = "Food";
export const FOOD_FIELD_PLACEHOLDER = "Type a food";
export const WHO_LABEL = "Who is it for?";
export const ADD_A_NAME_CHIP = "+ Add a name";
export const HOW_SERIOUS_LABEL = "How serious?";
export const DETAILS_LABEL = "Details (optional)";
export const DETAILS_PLACEHOLDER = "e.g. Tree nuts except coconut";
export const SAVE_LABEL = "Save";
export const UPDATE_LABEL = "Update";
export const CANCEL_LABEL = "Cancel";
export const REMOVE_LABEL = "Remove";
export const KEEP_LABEL = "Keep";
export const ADDED_TOAST = "Added.";
export const SAVED_TOAST = "Saved.";
export const REMOVED_TOAST = "Removed.";
export const EMPTY_RULES_TITLE = "No food rules yet.";
export const EMPTY_RULES_BODY = "Add an allergy or a food your Bot should never suggest.";
export const ADD_ONE_LABEL = "Add one";
export const EATER_CHANGE_LINE = "Ask an Admin or User to change these.";
export const MEALS_SECTION_TITLE = "Meals you never want";
export const MEALS_SECTION_HELPER =
  "Marked Never again on a dinner. Foods in a meal can still show up in other dinners.";
export const REMOVE_ALLERGY_TITLE = "Remove this allergy?";
export const DOWNGRADE_GUARD =
  "Not an allergy? This lets your Bot suggest it again in small amounts.";
export const PEOPLE_HELPER =
  "Everyone you plan dinner for. Add a name for someone without their own sign-in, like a child.";
export const PEOPLE_FOOTNOTE =
  "Signed-in people are managed under People. Only Admins and Users can add, rename or remove names.";
export const PEOPLE_EATER_FOOTNOTE = "Only Admins and Users can change who is at the table.";
export const SIGNS_IN_LABEL = "Signs in";
export const NAME_ONLY_LABEL = "Name only";
export const YOU_BADGE = "You";
export const RENAME_LABEL = "Rename";
export const ADD_NAME_PLACEHOLDER = "e.g. Sam";
export const ADD_NAME_FIELD_LABEL = "Name";
export const ADD_NAME_SUBMIT = "Add";
export const ALLERGY_SAFETY_SESSION_KEY = "bmm-food-rules-allergy-safety";

export const SEVERITY_HELPERS: Record<FoodRuleSeverity, string> = {
  allergy: "Avoid completely, including traces and cross-contact.",
  intolerance: "Avoid. Your Bot flags it if a recipe has any.",
  dislike: "Never suggest it. Not a safety rule.",
};

export function removeAllergyBody(food: string): string {
  return `Your Bot may suggest ${food} again.`;
}

export function alreadyOnList(food: string, who: string): string {
  return `${food} is already on ${who}\u2019s list.`;
}

export function foodRulesCountLabel(n: number): string {
  return n === 1 ? "1 food rule" : `${n} food rules`;
}

export function mealsCountLabel(n: number): string {
  return n === 1 ? "1 meal" : `${n} meals`;
}

export function rulesCountLabel(n: number): string {
  return n === 1 ? "1 rule" : `${n} rules`;
}

export function signsInLine(roleLabelText: string): string {
  return `${SIGNS_IN_LABEL} \u00b7 ${roleLabelText}`;
}

export function nameOnlyLine(ruleCount: number): string {
  return `${NAME_ONLY_LABEL} \u00b7 ${foodRulesCountLabel(ruleCount)}`;
}

export function removePersonRulesLine(foods: readonly string[]): string | null {
  if (foods.length === 0) return null;
  if (foods.length === 1) return `Their food rules go too: ${foods[0]}.`;
  if (foods.length === 2) return `Their food rules go too: ${foods[0]} and ${foods[1]}.`;
  const head = foods.slice(0, -1).join(", ");
  return `Their food rules go too: ${head}, and ${foods[foods.length - 1]}.`;
}

export function removePersonNightsLine(name: string): string {
  return `${name} also comes off any night they\u2019re listed. Plates stay as they are.`;
}

export function removePersonUndoLine(name: string): string {
  return `This can\u2019t be undone. You can add ${name} again, but you\u2019ll need to re-enter the rules.`;
}

export function keepPersonLabel(name: string): string {
  return `Keep ${name}`;
}

export function removePersonAction(name: string): string {
  return `Remove ${name}`;
}

function countPart(n: number, one: string, many: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * House row secondary line per spec §4.2 / mock 07.
 * "foods" = intolerances + dislikes. Meals are Never again rows.
 */
export function foodRulesHouseRowLine(
  rules: readonly FoodRule[],
  reviewedAt: string | null | undefined,
  neverAgainCount: number,
): string {
  if (!reviewedAt) return FOOD_RULES_NOT_SET_UP;
  const counts = foodRuleCounts(rules);
  const foods = counts.intolerances + counts.dislikes;
  const parts = [
    countPart(counts.allergies, "allergy", "allergies"),
    countPart(foods, "food", "foods"),
    countPart(neverAgainCount, "meal", "meals"),
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return FOOD_RULES_NONE;
  return parts.join(" \u00b7 ");
}
