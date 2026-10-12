import { ALLERGEN_CODES, type AllergenCode } from "./types";

export { ALLERGEN_CODES, type AllergenCode };

/** One row of the v1 `allergen_terms` seed. Term-for-term with the SQL migration. */
export type AllergenTermRow = {
  allergenCode: AllergenCode;
  term: string;
};

/** One row of the v1 `allergen_exclusions` seed. */
export type AllergenExclusionRow = {
  allergenCode: AllergenCode;
  phrase: string;
};

/**
 * TS mirror of `supabase/migrations/20261011220000_food_rules.sql` allergen_terms.
 * New terms ship by migration only. The drift test locks this list to the SQL seed.
 */
export const ALLERGEN_TERM_ROWS: readonly AllergenTermRow[] = [
  { allergenCode: "milk", term: "milk" },
  { allergenCode: "milk", term: "cream" },
  { allergenCode: "milk", term: "half and half" },
  { allergenCode: "milk", term: "butter" },
  { allergenCode: "milk", term: "buttermilk" },
  { allergenCode: "milk", term: "ghee" },
  { allergenCode: "milk", term: "cheese" },
  { allergenCode: "milk", term: "cheddar" },
  { allergenCode: "milk", term: "mozzarella" },
  { allergenCode: "milk", term: "parmesan" },
  { allergenCode: "milk", term: "parmigiano" },
  { allergenCode: "milk", term: "pecorino" },
  { allergenCode: "milk", term: "ricotta" },
  { allergenCode: "milk", term: "mascarpone" },
  { allergenCode: "milk", term: "feta" },
  { allergenCode: "milk", term: "gouda" },
  { allergenCode: "milk", term: "swiss" },
  { allergenCode: "milk", term: "provolone" },
  { allergenCode: "milk", term: "brie" },
  { allergenCode: "milk", term: "cream cheese" },
  { allergenCode: "milk", term: "cottage cheese" },
  { allergenCode: "milk", term: "queso" },
  { allergenCode: "milk", term: "paneer" },
  { allergenCode: "milk", term: "yogurt" },
  { allergenCode: "milk", term: "yoghurt" },
  { allergenCode: "milk", term: "kefir" },
  { allergenCode: "milk", term: "whey" },
  { allergenCode: "milk", term: "casein" },
  { allergenCode: "milk", term: "caseinate" },
  { allergenCode: "milk", term: "lactose" },
  { allergenCode: "milk", term: "custard" },
  { allergenCode: "milk", term: "ice cream" },
  { allergenCode: "milk", term: "gelato" },
  { allergenCode: "milk", term: "sour cream" },
  { allergenCode: "milk", term: "creme fraiche" },
  { allergenCode: "milk", term: "alfredo" },
  { allergenCode: "milk", term: "bechamel" },
  { allergenCode: "milk", term: "curd" },
  { allergenCode: "milk", term: "evaporated milk" },
  { allergenCode: "milk", term: "condensed milk" },
  { allergenCode: "eggs", term: "egg" },
  { allergenCode: "eggs", term: "egg white" },
  { allergenCode: "eggs", term: "egg yolk" },
  { allergenCode: "eggs", term: "yolk" },
  { allergenCode: "eggs", term: "albumen" },
  { allergenCode: "eggs", term: "mayonnaise" },
  { allergenCode: "eggs", term: "mayo" },
  { allergenCode: "eggs", term: "aioli" },
  { allergenCode: "eggs", term: "meringue" },
  { allergenCode: "eggs", term: "custard" },
  { allergenCode: "eggs", term: "hollandaise" },
  { allergenCode: "eggs", term: "bearnaise" },
  { allergenCode: "eggs", term: "frittata" },
  { allergenCode: "eggs", term: "quiche" },
  { allergenCode: "eggs", term: "omelet" },
  { allergenCode: "eggs", term: "omelette" },
  { allergenCode: "eggs", term: "brioche" },
  { allergenCode: "eggs", term: "lysozyme" },
  { allergenCode: "eggs", term: "ovalbumin" },
  { allergenCode: "eggs", term: "eggnog" },
  { allergenCode: "fish", term: "fish" },
  { allergenCode: "fish", term: "salmon" },
  { allergenCode: "fish", term: "tuna" },
  { allergenCode: "fish", term: "cod" },
  { allergenCode: "fish", term: "halibut" },
  { allergenCode: "fish", term: "tilapia" },
  { allergenCode: "fish", term: "trout" },
  { allergenCode: "fish", term: "bass" },
  { allergenCode: "fish", term: "snapper" },
  { allergenCode: "fish", term: "haddock" },
  { allergenCode: "fish", term: "mahi" },
  { allergenCode: "fish", term: "mahi mahi" },
  { allergenCode: "fish", term: "swordfish" },
  { allergenCode: "fish", term: "anchovy" },
  { allergenCode: "fish", term: "anchovies" },
  { allergenCode: "fish", term: "sardine" },
  { allergenCode: "fish", term: "mackerel" },
  { allergenCode: "fish", term: "herring" },
  { allergenCode: "fish", term: "catfish" },
  { allergenCode: "fish", term: "pollock" },
  { allergenCode: "fish", term: "fish sauce" },
  { allergenCode: "fish", term: "worcestershire" },
  { allergenCode: "fish", term: "caesar dressing" },
  { allergenCode: "fish", term: "surimi" },
  { allergenCode: "fish", term: "fish stock" },
  { allergenCode: "fish", term: "dashi" },
  { allergenCode: "fish", term: "bonito" },
  { allergenCode: "fish", term: "roe" },
  { allergenCode: "fish", term: "caviar" },
  { allergenCode: "shellfish", term: "shrimp" },
  { allergenCode: "shellfish", term: "prawn" },
  { allergenCode: "shellfish", term: "crab" },
  { allergenCode: "shellfish", term: "lobster" },
  { allergenCode: "shellfish", term: "crawfish" },
  { allergenCode: "shellfish", term: "crayfish" },
  { allergenCode: "shellfish", term: "scallop" },
  { allergenCode: "shellfish", term: "clam" },
  { allergenCode: "shellfish", term: "mussel" },
  { allergenCode: "shellfish", term: "oyster" },
  { allergenCode: "shellfish", term: "squid" },
  { allergenCode: "shellfish", term: "calamari" },
  { allergenCode: "shellfish", term: "octopus" },
  { allergenCode: "shellfish", term: "shellfish" },
  { allergenCode: "shellfish", term: "langoustine" },
  { allergenCode: "shellfish", term: "krill" },
  { allergenCode: "shellfish", term: "abalone" },
  { allergenCode: "shellfish", term: "snail" },
  { allergenCode: "shellfish", term: "escargot" },
  { allergenCode: "shellfish", term: "seafood" },
  { allergenCode: "shellfish", term: "oyster sauce" },
  { allergenCode: "shellfish", term: "shrimp paste" },
  { allergenCode: "tree_nuts", term: "almond" },
  { allergenCode: "tree_nuts", term: "walnut" },
  { allergenCode: "tree_nuts", term: "pecan" },
  { allergenCode: "tree_nuts", term: "cashew" },
  { allergenCode: "tree_nuts", term: "pistachio" },
  { allergenCode: "tree_nuts", term: "hazelnut" },
  { allergenCode: "tree_nuts", term: "filbert" },
  { allergenCode: "tree_nuts", term: "macadamia" },
  { allergenCode: "tree_nuts", term: "brazil nut" },
  { allergenCode: "tree_nuts", term: "pine nut" },
  { allergenCode: "tree_nuts", term: "chestnut" },
  { allergenCode: "tree_nuts", term: "praline" },
  { allergenCode: "tree_nuts", term: "marzipan" },
  { allergenCode: "tree_nuts", term: "nougat" },
  { allergenCode: "tree_nuts", term: "gianduja" },
  { allergenCode: "tree_nuts", term: "nutella" },
  { allergenCode: "tree_nuts", term: "nut butter" },
  { allergenCode: "tree_nuts", term: "almond milk" },
  { allergenCode: "tree_nuts", term: "almond flour" },
  { allergenCode: "tree_nuts", term: "amaretto" },
  { allergenCode: "tree_nuts", term: "frangelico" },
  { allergenCode: "tree_nuts", term: "tree nut" },
  { allergenCode: "tree_nuts", term: "nut" },
  { allergenCode: "peanuts", term: "peanut" },
  { allergenCode: "peanuts", term: "peanut butter" },
  { allergenCode: "peanuts", term: "groundnut" },
  { allergenCode: "peanuts", term: "goober" },
  { allergenCode: "peanuts", term: "arachis" },
  { allergenCode: "peanuts", term: "satay" },
  { allergenCode: "peanuts", term: "peanut oil" },
  { allergenCode: "peanuts", term: "mixed nuts" },
  { allergenCode: "wheat", term: "wheat" },
  { allergenCode: "wheat", term: "flour" },
  { allergenCode: "wheat", term: "bread" },
  { allergenCode: "wheat", term: "breadcrumb" },
  { allergenCode: "wheat", term: "bread crumb" },
  { allergenCode: "wheat", term: "panko" },
  { allergenCode: "wheat", term: "pasta" },
  { allergenCode: "wheat", term: "noodle" },
  { allergenCode: "wheat", term: "spaghetti" },
  { allergenCode: "wheat", term: "macaroni" },
  { allergenCode: "wheat", term: "penne" },
  { allergenCode: "wheat", term: "couscous" },
  { allergenCode: "wheat", term: "bulgur" },
  { allergenCode: "wheat", term: "farro" },
  { allergenCode: "wheat", term: "semolina" },
  { allergenCode: "wheat", term: "durum" },
  { allergenCode: "wheat", term: "spelt" },
  { allergenCode: "wheat", term: "kamut" },
  { allergenCode: "wheat", term: "seitan" },
  { allergenCode: "wheat", term: "gluten" },
  { allergenCode: "wheat", term: "pita" },
  { allergenCode: "wheat", term: "naan" },
  { allergenCode: "wheat", term: "cracker" },
  { allergenCode: "wheat", term: "croissant" },
  { allergenCode: "wheat", term: "bun" },
  { allergenCode: "wheat", term: "bagel" },
  { allergenCode: "wheat", term: "pizza dough" },
  { allergenCode: "wheat", term: "soy sauce" },
  { allergenCode: "wheat", term: "udon" },
  { allergenCode: "wheat", term: "orzo" },
  { allergenCode: "wheat", term: "cereal" },
  { allergenCode: "wheat", term: "malt" },
  { allergenCode: "wheat", term: "tortilla" },
  { allergenCode: "soy", term: "soy" },
  { allergenCode: "soy", term: "soya" },
  { allergenCode: "soy", term: "soybean" },
  { allergenCode: "soy", term: "edamame" },
  { allergenCode: "soy", term: "tofu" },
  { allergenCode: "soy", term: "tempeh" },
  { allergenCode: "soy", term: "miso" },
  { allergenCode: "soy", term: "natto" },
  { allergenCode: "soy", term: "soy sauce" },
  { allergenCode: "soy", term: "shoyu" },
  { allergenCode: "soy", term: "tamari" },
  { allergenCode: "soy", term: "teriyaki" },
  { allergenCode: "soy", term: "hoisin" },
  { allergenCode: "soy", term: "soy milk" },
  { allergenCode: "soy", term: "soy lecithin" },
  { allergenCode: "soy", term: "textured vegetable protein" },
  { allergenCode: "soy", term: "tvp" },
  { allergenCode: "sesame", term: "sesame" },
  { allergenCode: "sesame", term: "tahini" },
  { allergenCode: "sesame", term: "sesame oil" },
  { allergenCode: "sesame", term: "sesame seed" },
  { allergenCode: "sesame", term: "benne" },
  { allergenCode: "sesame", term: "gomasio" },
  { allergenCode: "sesame", term: "halvah" },
  { allergenCode: "sesame", term: "halva" },
  { allergenCode: "sesame", term: "hummus" },
  { allergenCode: "sesame", term: "zaatar" },
  { allergenCode: "sesame", term: "furikake" },
];

/**
 * Phrases that contain an allergen word but are not that allergen.
 * Mirror of `allergen_exclusions` in the same migration.
 */
export const ALLERGEN_EXCLUSION_ROWS: readonly AllergenExclusionRow[] = [
  { allergenCode: "milk", phrase: "peanut butter" },
  { allergenCode: "milk", phrase: "almond butter" },
  { allergenCode: "milk", phrase: "nut butter" },
  { allergenCode: "milk", phrase: "cashew butter" },
  { allergenCode: "milk", phrase: "sunflower butter" },
  { allergenCode: "milk", phrase: "cocoa butter" },
  { allergenCode: "milk", phrase: "shea butter" },
  { allergenCode: "milk", phrase: "butter bean" },
  { allergenCode: "milk", phrase: "butter beans" },
  { allergenCode: "milk", phrase: "butternut" },
  { allergenCode: "milk", phrase: "coconut milk" },
  { allergenCode: "milk", phrase: "almond milk" },
  { allergenCode: "milk", phrase: "oat milk" },
  { allergenCode: "milk", phrase: "rice milk" },
  { allergenCode: "milk", phrase: "soy milk" },
  { allergenCode: "milk", phrase: "coconut cream" },
  { allergenCode: "milk", phrase: "cream of tartar" },
  { allergenCode: "milk", phrase: "coconut yogurt" },
  { allergenCode: "milk", phrase: "dairy free" },
  { allergenCode: "milk", phrase: "non dairy" },
  { allergenCode: "wheat", phrase: "rice noodle" },
  { allergenCode: "wheat", phrase: "rice noodles" },
  { allergenCode: "wheat", phrase: "rice flour" },
  { allergenCode: "wheat", phrase: "almond flour" },
  { allergenCode: "wheat", phrase: "coconut flour" },
  { allergenCode: "wheat", phrase: "corn tortilla" },
  { allergenCode: "wheat", phrase: "corn tortillas" },
  { allergenCode: "wheat", phrase: "gluten free" },
  { allergenCode: "wheat", phrase: "buckwheat noodle" },
  { allergenCode: "wheat", phrase: "chickpea flour" },
  { allergenCode: "tree_nuts", phrase: "water chestnut" },
  { allergenCode: "tree_nuts", phrase: "water chestnuts" },
  { allergenCode: "tree_nuts", phrase: "peanut" },
  { allergenCode: "tree_nuts", phrase: "peanuts" },
  { allergenCode: "tree_nuts", phrase: "peanut butter" },
  { allergenCode: "tree_nuts", phrase: "mixed nuts" },
  { allergenCode: "tree_nuts", phrase: "nutmeg" },
  { allergenCode: "soy", phrase: "soy free" },
];

function groupTerms(rows: readonly AllergenTermRow[]): Record<AllergenCode, readonly string[]> {
  const next = Object.fromEntries(ALLERGEN_CODES.map((code) => [code, [] as string[]])) as Record<
    AllergenCode,
    string[]
  >;
  for (const row of rows) {
    next[row.allergenCode].push(row.term);
  }
  return next;
}

function groupExclusions(
  rows: readonly AllergenExclusionRow[],
): Record<AllergenCode, readonly string[]> {
  const next = Object.fromEntries(ALLERGEN_CODES.map((code) => [code, [] as string[]])) as Record<
    AllergenCode,
    string[]
  >;
  for (const row of rows) {
    next[row.allergenCode].push(row.phrase);
  }
  return next;
}

export const ALLERGEN_TERMS: Record<AllergenCode, readonly string[]> = groupTerms(ALLERGEN_TERM_ROWS);
export const ALLERGEN_EXCLUSIONS: Record<AllergenCode, readonly string[]> =
  groupExclusions(ALLERGEN_EXCLUSION_ROWS);

export const ALLERGEN_MIGRATION_PATH = "supabase/migrations/20261011220000_food_rules.sql";

const PAIR_RE = /\('([a-z_]+)','([^']+)'\)/g;

function parseCode(value: string): AllergenCode | null {
  switch (value) {
    case "milk":
    case "eggs":
    case "fish":
    case "shellfish":
    case "tree_nuts":
    case "peanuts":
    case "wheat":
    case "soy":
    case "sesame":
      return value;
    default:
      return null;
  }
}

function blockBetween(sql: string, startNeedle: string, endNeedle: string): string {
  const start = sql.indexOf(startNeedle);
  if (start < 0) return "";
  const from = sql.indexOf("from (values", start);
  if (from < 0) return "";
  const end = sql.indexOf(endNeedle, from);
  return end < 0 ? sql.slice(from) : sql.slice(from, end);
}

/** Parse the v1 seed inserts. Used by the drift test so TS and SQL cannot diverge. */
export function parseAllergenVocabularySql(sql: string): {
  terms: AllergenTermRow[];
  exclusions: AllergenExclusionRow[];
} {
  const termBlock = blockBetween(sql, "insert into public.allergen_terms", "on conflict do nothing");
  const exclusionBlock = blockBetween(
    sql,
    "insert into public.allergen_exclusions",
    "on conflict do nothing",
  );

  const terms: AllergenTermRow[] = [];
  for (const match of termBlock.matchAll(PAIR_RE)) {
    const code = parseCode(match[1] ?? "");
    const term = match[2] ?? "";
    if (code && term) terms.push({ allergenCode: code, term });
  }

  const exclusions: AllergenExclusionRow[] = [];
  for (const match of exclusionBlock.matchAll(PAIR_RE)) {
    const code = parseCode(match[1] ?? "");
    const phrase = match[2] ?? "";
    if (code && phrase) exclusions.push({ allergenCode: code, phrase });
  }

  return { terms, exclusions };
}
