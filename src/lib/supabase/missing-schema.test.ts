import { describe, expect, it } from "vitest";
import {
  isFoodRulesSchemaReady,
  isMissingSchemaError,
  noteFoodRulesSchemaReady,
  optionalFoodRulesRows,
} from "./missing-schema";

describe("missing schema (live DBs before food-rules migrations)", () => {
  it("recognizes PostgREST and Postgres missing-relation codes", () => {
    expect(isMissingSchemaError({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissingSchemaError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });

  it("treats a missing table as empty rows and not ready", () => {
    const parsed = optionalFoodRulesRows(
      { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.food_rules' in the schema cache" } },
      (rows) => (Array.isArray(rows) ? rows : ["should-not-run"]),
    );
    expect(parsed).toEqual({ rows: [], ready: false });
    expect(
      optionalFoodRulesRows({ data: [{ id: "1" }], error: null }, (rows) => (Array.isArray(rows) ? rows : [])),
    ).toEqual({ rows: [{ id: "1" }], ready: true });
  });

  it("records schema readiness for realtime without extra polls", () => {
    noteFoodRulesSchemaReady(false);
    expect(isFoodRulesSchemaReady()).toBe(false);
    noteFoodRulesSchemaReady(true);
    expect(isFoodRulesSchemaReady()).toBe(true);
    noteFoodRulesSchemaReady(false);
    expect(isFoodRulesSchemaReady()).toBe(false);
  });
});
