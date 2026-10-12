import { describe, expect, it } from "vitest";
import { normText, ruleHit, textHasTerm } from "./food-rule-match";

describe("normText", () => {
  it("lowercases, strips listed accents and punctuation, and pads", () => {
    expect(normText("Crème fraîche")).toBe(" creme fraiche ");
    expect(normText("béchamel")).toBe(" bechamel ");
    expect(normText("za'atar")).toBe(" za atar ");
    expect(normText("half-and-half")).toBe(" half and half ");
    expect(normText("")).toBe("  ");
  });
});

describe("textHasTerm", () => {
  it("matches whole words and conservative plurals, not substrings", () => {
    const hay = normText("Thai peanuts and rice");
    expect(textHasTerm(hay, "peanut")).toBe(true);
    expect(textHasTerm(hay, "peanuts")).toBe(true);
    expect(textHasTerm(normText("Peanut noodles"), "peanuts")).toBe(true);
    expect(textHasTerm(normText("butternut squash"), "nut")).toBe(false);
    expect(textHasTerm(normText("walnut brownies"), "peanut")).toBe(false);
  });
});

describe("ruleHit", () => {
  it("does not treat peanut butter or butternut as milk", () => {
    const milk = { foodKey: "milk", allergenCode: "milk" as const };
    expect(ruleHit(milk, "Peanut butter toast")).toBeNull();
    expect(ruleHit(milk, "Butternut squash soup")).toBeNull();
    expect(ruleHit(milk, "Coconut milk curry")).toBeNull();
    expect(ruleHit(milk, "Mac and cheese")).toBeTruthy();
    expect(ruleHit(milk, "Grilled cheeses")).toBeTruthy();
    expect(ruleHit(milk, "crème fraîche")).toBeTruthy();
  });

  it("matches a peanut rule on plurals and not on walnut or butternut", () => {
    const peanuts = { foodKey: "peanuts", allergenCode: "peanuts" as const };
    expect(ruleHit(peanuts, "Peanut noodles")).toBeTruthy();
    expect(ruleHit(peanuts, "Thai peanuts and rice")).toBeTruthy();
    expect(ruleHit(peanuts, "Butternut squash")).toBeNull();
    expect(ruleHit(peanuts, "Walnut brownies")).toBeNull();
  });

  it("does not let a tree-nut rule hit peanut, and does hit walnut", () => {
    const treeNuts = { foodKey: "tree nuts", allergenCode: "tree_nuts" as const };
    expect(ruleHit(treeNuts, "peanut butter cookies")).toBeNull();
    expect(ruleHit(treeNuts, "peanuts")).toBeNull();
    expect(ruleHit(treeNuts, "butternut squash")).toBeNull();
    expect(ruleHit(treeNuts, "walnut brownies")).toBe("walnut");
    expect(ruleHit(treeNuts, "mixed nuts")).toBeNull();
  });

  it("matches free-text rules on their own words only", () => {
    const celery = { foodKey: "celery", allergenCode: null };
    expect(ruleHit(celery, "celery soup")).toBe("celery");
    expect(ruleHit(celery, "celeriac mash")).toBeNull();
  });
});
