import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLERGEN_EXCLUSION_ROWS,
  ALLERGEN_MIGRATION_PATH,
  ALLERGEN_TERM_ROWS,
  parseAllergenVocabularySql,
} from "./allergens";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("allergen vocabulary drift", () => {
  it("matches allergen_terms and allergen_exclusions in the v1 migration term-for-term", () => {
    const sql = readFileSync(path.join(repoRoot, ALLERGEN_MIGRATION_PATH), "utf8");
    const parsed = parseAllergenVocabularySql(sql);
    expect(parsed.terms).toEqual([...ALLERGEN_TERM_ROWS]);
    expect(parsed.exclusions).toEqual([...ALLERGEN_EXCLUSION_ROWS]);
    expect(parsed.terms).toHaveLength(203);
    expect(parsed.exclusions).toHaveLength(38);
  });
});
