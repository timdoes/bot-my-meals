import { ALLERGEN_EXCLUSIONS, ALLERGEN_TERMS } from "./allergens";
import type { AllergenCode } from "./types";

/**
 * Same mapping as `private.norm_text` in `20261011220000_food_rules.sql`:
 * lowercase, strip the listed accents, replace non-alphanumerics with spaces, pad.
 */
const ACCENT_FROM = "àáâãäåèéêëìíîïòóôõöùúûüçñ";
const ACCENT_TO = "aaaaaaeeeeiiiiooooouuuucn";

export type FoodRuleMatchInput = {
  foodKey: string;
  allergenCode: AllergenCode | null;
};

export function normText(input: string | null | undefined): string {
  let mapped = "";
  for (const ch of (input ?? "").toLowerCase()) {
    const index = ACCENT_FROM.indexOf(ch);
    mapped += index >= 0 ? ACCENT_TO[index] : ch;
  }
  return ` ${mapped.replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/**
 * Whole-word / phrase match with conservative plural handling.
 * Identical to `private.text_has_term(p_norm, p_term)`.
 * `p_norm` must already be `normText` output (padded).
 */
export function textHasTerm(pNorm: string, pTerm: string): boolean {
  const t = normText(pTerm);
  const base = t.replace(/\s+$/, "");
  const trimmed = t.trim();
  if (!trimmed) return false;
  if (pNorm.includes(t) || pNorm.includes(`${base}s `) || pNorm.includes(`${base}es `)) {
    return true;
  }
  if (trimmed.length > 3 && trimmed.endsWith("s") && pNorm.includes(`${base.slice(0, -1)} `)) {
    return true;
  }
  return false;
}

function stripExclusions(norm: string, phrases: readonly string[]): string {
  let next = norm;
  for (const phrase of phrases) {
    const padded = normText(phrase);
    if (padded.trim() === "") continue;
    next = next.split(padded).join(" ");
  }
  return next;
}

/**
 * Returns the matched word, or null. Exclusion phrases are removed first for
 * allergen-coded rules. Free-text rules match their own `foodKey` only.
 * Identical to `private.rule_hit`.
 */
export function ruleHit(rule: FoodRuleMatchInput, text: string): string | null {
  let norm = normText(text);
  if (rule.allergenCode) {
    norm = stripExclusions(norm, ALLERGEN_EXCLUSIONS[rule.allergenCode] ?? []);
  }

  if (textHasTerm(norm, rule.foodKey)) {
    return rule.foodKey;
  }

  if (rule.allergenCode) {
    for (const term of ALLERGEN_TERMS[rule.allergenCode] ?? []) {
      if (textHasTerm(norm, term)) return term;
    }
  }

  return null;
}
