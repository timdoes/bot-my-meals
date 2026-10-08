import { describe, expect, it } from "vitest";
import {
  catalogNameForSlug,
  catalogSlugForName,
  classifyPostalCode,
  grocersForPostalCode,
  normalizePostalCode,
  storeMatchesGrocer,
  storeSlugForAdd,
} from "./grocers";

describe("static regional grocers", () => {
  it("normalizes US zip, Canadian postal, and unknown input", () => {
    expect(classifyPostalCode("84121").kind).toBe("us");
    expect(normalizePostalCode("84121-1234")).toBe("84121");
    expect(classifyPostalCode("M5V 2T6").kind).toBe("ca");
    expect(normalizePostalCode("m5v2t6")).toBe("M5V 2T6");
    expect(classifyPostalCode("SW1A 1AA").kind).toBe("uk");
    expect(classifyPostalCode("??").kind).toBe("unknown");
  });

  it("returns Utah grocers for 84xxx without prefilling anything", () => {
    const names = grocersForPostalCode("84121").map((grocer) => grocer.name);
    expect(names).toContain("Smith's");
    expect(names).toContain("Harmons");
    expect(names).toContain("WinCo");
    expect(names).toContain("Walmart");
    expect(grocersForPostalCode("")).toEqual([]);
  });

  it("returns H-E-B for Texas and QFC for Seattle", () => {
    expect(grocersForPostalCode("78701").map((grocer) => grocer.name)).toContain("H-E-B");
    expect(grocersForPostalCode("98101").map((grocer) => grocer.name)).toContain("QFC");
  });

  it("never invents prices or cart claims", () => {
    const encoded = JSON.stringify(grocersForPostalCode("84121"));
    expect(encoded).not.toContain("$");
    expect(encoded.toLowerCase()).not.toContain("cart");
    expect(encoded.toLowerCase()).not.toContain("price");
  });

  it("stores curated grocers under the catalog slug, not an apostrophe slug", () => {
    expect(catalogSlugForName("Smith's")).toBe("smiths");
    expect(catalogSlugForName("Trader Joe's")).toBe("trader-joes");
    expect(catalogSlugForName("Smith’s")).toBe("smiths");
    expect(storeSlugForAdd("Smith's", "smith-s")).toBe("smiths");
    expect(storeSlugForAdd("Trader Joe's", "trader-joe-s")).toBe("trader-joes");
    expect(storeSlugForAdd("Corner market")).toBe("corner-market");
    expect(catalogSlugForName("Corner market")).toBeNull();
  });

  it("matches selected grocers by slug or name", () => {
    expect(
      storeMatchesGrocer({ slug: "smiths", name: "Smith's" }, { slug: "smiths", name: "Smith's" }),
    ).toBe(true);
    expect(
      storeMatchesGrocer({ slug: "custom", name: "Harmons" }, { slug: "harmons", name: "Harmons" }),
    ).toBe(true);
    expect(
      storeMatchesGrocer({ slug: "winco", name: "WinCo" }, { slug: "smiths", name: "Smith's" }),
    ).toBe(false);
  });
});

describe("catalogNameForSlug", () => {
  it("names catalog slugs and leaves household-typed ones alone", () => {
    expect(catalogNameForSlug("walmart")).toBe("Walmart");
    expect(catalogNameForSlug("kroger")).toBe("Kroger");
    expect(catalogNameForSlug(" Smiths ")).toBe("Smith's");
    expect(catalogNameForSlug("rosas-corner-market")).toBeNull();
    expect(catalogNameForSlug("")).toBeNull();
  });
});
