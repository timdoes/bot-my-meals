import { slugify } from "./ids";

export type Grocer = {
  slug: string;
  name: string;
};

export const NATIONAL_GROCERS: Grocer[] = [
  { slug: "walmart", name: "Walmart" },
  { slug: "costco", name: "Costco" },
  { slug: "aldi", name: "Aldi" },
  { slug: "target", name: "Target" },
  { slug: "whole-foods", name: "Whole Foods" },
];

const US_BY_FIRST_DIGIT: Record<string, Grocer[]> = {
  "0": [
    { slug: "stop-and-shop", name: "Stop & Shop" },
    { slug: "hannaford", name: "Hannaford" },
    { slug: "market-basket", name: "Market Basket" },
    { slug: "shoprite", name: "ShopRite" },
  ],
  "1": [
    { slug: "wegmans", name: "Wegmans" },
    { slug: "shoprite", name: "ShopRite" },
    { slug: "giant", name: "Giant" },
    { slug: "weis", name: "Weis" },
  ],
  "2": [
    { slug: "giant", name: "Giant" },
    { slug: "food-lion", name: "Food Lion" },
    { slug: "harris-teeter", name: "Harris Teeter" },
    { slug: "publix", name: "Publix" },
  ],
  "3": [
    { slug: "publix", name: "Publix" },
    { slug: "kroger", name: "Kroger" },
    { slug: "food-lion", name: "Food Lion" },
    { slug: "ingles", name: "Ingles" },
  ],
  "4": [
    { slug: "kroger", name: "Kroger" },
    { slug: "meijer", name: "Meijer" },
    { slug: "giant-eagle", name: "Giant Eagle" },
    { slug: "fresh-thyme", name: "Fresh Thyme" },
  ],
  "5": [
    { slug: "hy-vee", name: "Hy-Vee" },
    { slug: "cub", name: "Cub" },
    { slug: "lunds-byerlys", name: "Lunds & Byerlys" },
    { slug: "fareway", name: "Fareway" },
  ],
  "6": [
    { slug: "schnucks", name: "Schnucks" },
    { slug: "hy-vee", name: "Hy-Vee" },
    { slug: "kroger", name: "Kroger" },
    { slug: "jewel-osco", name: "Jewel-Osco" },
  ],
  "7": [
    { slug: "h-e-b", name: "H-E-B" },
    { slug: "kroger", name: "Kroger" },
    { slug: "albertsons", name: "Albertsons" },
    { slug: "brookshires", name: "Brookshire's" },
  ],
  "8": [
    { slug: "smiths", name: "Smith's" },
    { slug: "safeway", name: "Safeway" },
    { slug: "king-soopers", name: "King Soopers" },
    { slug: "winco", name: "WinCo" },
    { slug: "harmons", name: "Harmons" },
  ],
  "9": [
    { slug: "safeway", name: "Safeway" },
    { slug: "ralphs", name: "Ralphs" },
    { slug: "qfc", name: "QFC" },
    { slug: "fred-meyer", name: "Fred Meyer" },
    { slug: "winco", name: "WinCo" },
    { slug: "grocery-outlet", name: "Grocery Outlet" },
  ],
};

const US_BY_ZIP3: Record<string, Grocer[]> = {
  "840": utahGrocers(),
  "841": utahGrocers(),
  "842": utahGrocers(),
  "843": utahGrocers(),
  "844": utahGrocers(),
  "845": utahGrocers(),
  "846": utahGrocers(),
  "847": utahGrocers(),
  "890": [
    { slug: "smiths", name: "Smith's" },
    { slug: "albertsons", name: "Albertsons" },
    { slug: "winco", name: "WinCo" },
    { slug: "vons", name: "Vons" },
  ],
  "891": [
    { slug: "smiths", name: "Smith's" },
    { slug: "albertsons", name: "Albertsons" },
    { slug: "winco", name: "WinCo" },
    { slug: "vons", name: "Vons" },
  ],
  "900": laGrocers(),
  "901": laGrocers(),
  "902": laGrocers(),
  "903": laGrocers(),
  "904": laGrocers(),
  "905": laGrocers(),
  "906": laGrocers(),
  "907": laGrocers(),
  "908": laGrocers(),
  "910": laGrocers(),
  "911": laGrocers(),
  "912": laGrocers(),
  "913": laGrocers(),
  "914": laGrocers(),
  "915": laGrocers(),
  "916": laGrocers(),
  "917": laGrocers(),
  "918": laGrocers(),
  "980": [
    { slug: "qfc", name: "QFC" },
    { slug: "fred-meyer", name: "Fred Meyer" },
    { slug: "safeway", name: "Safeway" },
    { slug: "pcc", name: "PCC" },
  ],
  "981": [
    { slug: "qfc", name: "QFC" },
    { slug: "fred-meyer", name: "Fred Meyer" },
    { slug: "safeway", name: "Safeway" },
    { slug: "pcc", name: "PCC" },
  ],
};

const CA_BY_LETTER: Record<string, Grocer[]> = {
  A: atlanticCanada(),
  B: atlanticCanada(),
  C: atlanticCanada(),
  E: atlanticCanada(),
  G: quebecGrocers(),
  H: quebecGrocers(),
  J: quebecGrocers(),
  K: ontarioGrocers(),
  L: ontarioGrocers(),
  M: ontarioGrocers(),
  N: ontarioGrocers(),
  P: ontarioGrocers(),
  R: [
    { slug: "sobeys", name: "Sobeys" },
    { slug: "superstore", name: "Real Canadian Superstore" },
    { slug: "safeway", name: "Safeway" },
  ],
  S: [
    { slug: "sobeys", name: "Sobeys" },
    { slug: "superstore", name: "Real Canadian Superstore" },
    { slug: "coop", name: "Co-op" },
  ],
  T: [
    { slug: "safeway", name: "Safeway" },
    { slug: "superstore", name: "Real Canadian Superstore" },
    { slug: "sobeys", name: "Sobeys" },
    { slug: "coop", name: "Co-op" },
  ],
  V: [
    { slug: "save-on-foods", name: "Save-On-Foods" },
    { slug: "superstore", name: "Real Canadian Superstore" },
    { slug: "safeway", name: "Safeway" },
  ],
};

const UK_GROCERS: Grocer[] = [
  { slug: "tesco", name: "Tesco" },
  { slug: "sainsburys", name: "Sainsbury's" },
  { slug: "asda", name: "Asda" },
  { slug: "morrisons", name: "Morrisons" },
  { slug: "waitrose", name: "Waitrose" },
  { slug: "aldi", name: "Aldi" },
  { slug: "lidl", name: "Lidl" },
];

function utahGrocers(): Grocer[] {
  return [
    { slug: "smiths", name: "Smith's" },
    { slug: "harmons", name: "Harmons" },
    { slug: "winco", name: "WinCo" },
    { slug: "trader-joes", name: "Trader Joe's" },
  ];
}

function laGrocers(): Grocer[] {
  return [
    { slug: "ralphs", name: "Ralphs" },
    { slug: "vons", name: "Vons" },
    { slug: "trader-joes", name: "Trader Joe's" },
    { slug: "gelsons", name: "Gelson's" },
  ];
}

function atlanticCanada(): Grocer[] {
  return [
    { slug: "sobeys", name: "Sobeys" },
    { slug: "superstore", name: "Real Canadian Superstore" },
    { slug: "colemans", name: "Coleman's" },
  ];
}

function quebecGrocers(): Grocer[] {
  return [
    { slug: "metro", name: "Metro" },
    { slug: "iga", name: "IGA" },
    { slug: "maxi", name: "Maxi" },
    { slug: "provigo", name: "Provigo" },
  ];
}

function ontarioGrocers(): Grocer[] {
  return [
    { slug: "loblaws", name: "Loblaws" },
    { slug: "sobeys", name: "Sobeys" },
    { slug: "metro", name: "Metro" },
    { slug: "no-frills", name: "No Frills" },
    { slug: "food-basics", name: "Food Basics" },
  ];
}

function uniqueGrocers(lists: Grocer[][]): Grocer[] {
  const seen = new Set<string>();
  const out: Grocer[] = [];
  for (const list of lists) {
    for (const grocer of list) {
      if (seen.has(grocer.slug)) continue;
      seen.add(grocer.slug);
      out.push(grocer);
    }
  }
  return out;
}

export type PostalKind = "us" | "ca" | "uk" | "unknown";

export function classifyPostalCode(input: string): { kind: PostalKind; key: string } {
  const trimmed = input.trim();
  const compact = trimmed.replace(/[\s-]+/g, "").toUpperCase();
  if (/^\d{5}(\d{4})?$/.test(compact)) {
    return { kind: "us", key: compact.slice(0, 5) };
  }
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) {
    return { kind: "ca", key: compact };
  }
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact) || /^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact)) {
    return { kind: "uk", key: compact };
  }
  return { kind: "unknown", key: compact };
}

export function normalizePostalCode(input: string): string {
  const classified = classifyPostalCode(input);
  switch (classified.kind) {
    case "us":
      return classified.key;
    case "ca":
      return `${classified.key.slice(0, 3)} ${classified.key.slice(3)}`;
    case "uk":
      return classified.key.length > 3
        ? `${classified.key.slice(0, classified.key.length - 3)} ${classified.key.slice(-3)}`
        : classified.key;
    case "unknown":
      return input.trim();
    default: {
      const _exhaustive: never = classified.kind;
      return _exhaustive;
    }
  }
}

/** Curated labels for a zip/postal region. Never prices. Nothing is preselected. */
export function grocersForPostalCode(input: string): Grocer[] {
  const classified = classifyPostalCode(input);
  switch (classified.kind) {
    case "us": {
      const zip3 = classified.key.slice(0, 3);
      const digit = classified.key.slice(0, 1);
      return uniqueGrocers([US_BY_ZIP3[zip3] ?? [], US_BY_FIRST_DIGIT[digit] ?? [], NATIONAL_GROCERS]);
    }
    case "ca": {
      const letter = classified.key.slice(0, 1);
      return uniqueGrocers([CA_BY_LETTER[letter] ?? [], NATIONAL_GROCERS]);
    }
    case "uk":
      return uniqueGrocers([UK_GROCERS]);
    case "unknown":
      return input.trim() ? NATIONAL_GROCERS : [];
    default: {
      const _exhaustive: never = classified.kind;
      return _exhaustive;
    }
  }
}

export function storeMatchesGrocer(
  store: { slug: string; name: string },
  grocer: Grocer,
): boolean {
  return (
    store.slug === grocer.slug ||
    normalizeStoreName(store.name) === normalizeStoreName(grocer.name)
  );
}

function allCatalogGrocers(): Grocer[] {
  return uniqueGrocers([
    NATIONAL_GROCERS,
    ...Object.values(US_BY_FIRST_DIGIT),
    ...Object.values(US_BY_ZIP3),
    ...Object.values(CA_BY_LETTER),
    UK_GROCERS,
  ]);
}

function normalizeStoreName(name: string): string {
  return name.trim().toLowerCase().replace(/[\u2018\u2019]/g, "'");
}

/** Curated display name for a catalog slug (`kroger` → `Kroger`). Null when the slug is not in the catalog. */
export function catalogNameForSlug(slug: string): string | null {
  const wanted = slug.trim().toLowerCase();
  if (!wanted) return null;
  return allCatalogGrocers().find((grocer) => grocer.slug === wanted)?.name ?? null;
}

/** Catalog slug for a curated grocer name. Null for a household-typed store. */
export function catalogSlugForName(name: string): string | null {
  const normalized = normalizeStoreName(name);
  if (!normalized) return null;
  const match = allCatalogGrocers().find((grocer) => normalizeStoreName(grocer.name) === normalized);
  return match?.slug ?? null;
}

/**
 * Slug to store. A curated name always wins (`Smith's` → `smiths`), even when
 * the caller slugified the apostrophe into `smith-s`.
 */
export function storeSlugForAdd(name: string, slug?: string): string {
  const catalog = catalogSlugForName(name);
  if (catalog) return catalog;
  const provided = slug?.trim();
  if (provided) return provided;
  return slugify(name);
}
