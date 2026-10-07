import type { MealDislike } from "./types";

export const DISLIKE_TITLE = "What didn\u2019t work?";
export const NEVER_AGAIN_LABEL = "Never again";
export const DISLIKE_NOTE_LABEL = "What didn\u2019t you like?";
export const DISLIKE_NOTE_PLACEHOLDER = "Optional";
export const DISLIKE_SEND_LABEL = "Send";
export const DISLIKE_CANCEL_LABEL = "Cancel";
export const DISLIKE_GOT_IT_TOAST = "Got it.";
export const NEVER_AGAIN_TOAST = "Never again.";
export const NEVER_AGAIN_LIST_LABEL = "Never again";
export const NEVER_AGAIN_EMPTY = "No meals marked Never again.";
export const ALLOW_AGAIN_LABEL = "Allow again";
export const DISLIKE_BUTTON_LABEL = "What didn\u2019t you like?";

export type DislikeDraft = {
  neverAgain: boolean;
  note: string;
};

export type DislikeAction = "block" | "feedback" | "allow";

/**
 * Thumbs-down Send.
 * Never again on stores a whole-meal block (text optional).
 * Off with text stores part feedback and leaves the meal suggestable.
 * Off and empty stores nothing, unless the meal is already blocked — then it allows again.
 */
export function dislikeSendAction(draft: DislikeDraft, currentlyBlocked: boolean): DislikeAction | null {
  if (draft.neverAgain) return "block";
  if (draft.note.trim()) return "feedback";
  if (currentlyBlocked) return "allow";
  return null;
}

export function dislikeToast(action: DislikeAction): string {
  switch (action) {
    case "block":
      return NEVER_AGAIN_TOAST;
    case "feedback":
    case "allow":
      return DISLIKE_GOT_IT_TOAST;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function mealDislikeForKey(
  rows: readonly MealDislike[],
  recipeKey: string,
): MealDislike | undefined {
  if (!recipeKey) return undefined;
  return rows.find((row) => row.recipeKey === recipeKey);
}

export function mealIsBlocked(rows: readonly MealDislike[], recipeKey: string): boolean {
  return Boolean(mealDislikeForKey(rows, recipeKey)?.neverAgain);
}

/** Feedback-only notes stay out of this list. */
export function neverAgainMeals(rows: readonly MealDislike[]): MealDislike[] {
  return rows
    .filter((row) => row.neverAgain)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
}

export function clearNeverAgain(rows: readonly MealDislike[], recipeKey: string): MealDislike[] {
  return rows.flatMap((row) => {
    if (row.recipeKey !== recipeKey || !row.neverAgain) return [row];
    if (!row.note.trim()) return [];
    return [{ ...row, neverAgain: false }];
  });
}

export function parseMealDislikes(rows: unknown): MealDislike[] {
  if (!Array.isArray(rows)) return [];
  const parsed = rows.flatMap((row): MealDislike[] => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const recipeKey = typeof record.recipe_key === "string" ? record.recipe_key.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!recipeKey || !title || record.id == null || record.household_id == null) return [];
    const note = typeof record.note === "string" ? record.note : "";
    return [
      {
        id: String(record.id),
        householdId: String(record.household_id),
        recipeKey,
        title,
        neverAgain: record.never_again === true,
        note,
        updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
      },
    ];
  });
  return neverAgainMeals(parsed).concat(parsed.filter((row) => !row.neverAgain));
}
