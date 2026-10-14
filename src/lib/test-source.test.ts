import { describe, expect, it } from "vitest";
import { sourceBetween } from "./test-source";

describe("sourceBetween", () => {
  const src = "const a = 1;\nconst refresh = () => sync();\nconst next = () => wake();\n";

  it("returns the text between two markers", () => {
    expect(sourceBetween(src, "const refresh", "const next")).toBe("const refresh = () => sync();\n");
  });

  it("throws when the end marker is gone instead of reading to the end of the file", () => {
    // The Oct 7 managed CI failure (same pattern here): the end marker was renamed, indexOf returned -1, and the
    // slice swallowed later code that does call the bot.
    expect(() => sourceBetween(src, "const refresh", "const renamed")).toThrow(/end marker not found/);
  });

  it("throws when the start marker is gone", () => {
    expect(() => sourceBetween(src, "const missing", "const next")).toThrow(/start marker not found/);
  });

  it("only looks for the end marker after the start", () => {
    expect(() => sourceBetween(src, "const next", "const refresh")).toThrow(/end marker not found/);
  });
});
