import { afterEach, describe, expect, it } from "vitest";
import {
  HOUSE_SETUP_EIGHT_STEP_FLAG,
  SETUP_EIGHT_STEP_READY_RPC,
  isFoodRulesSchemaReady,
  isHouseSetupEightStepLive,
  isMissingSchemaError,
  isSetupStepNineRemapReady,
  noteFoodRulesSchemaReady,
  noteSetupStepNineRemapReady,
  optionalFoodRulesRows,
  parseSetupEightStepReady,
  syncHouseSetupEightStepGate,
} from "./missing-schema";

describe("missing schema (live DBs before food-rules migrations)", () => {
  it("recognizes PostgREST and Postgres missing-relation codes", () => {
    expect(isMissingSchemaError({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isMissingSchemaError({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissingSchemaError({ code: "42883", message: "function public.setup_eight_step_ready() does not exist" })).toBe(true);
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

describe("houseSetupEightStep snapshot flag", () => {
  afterEach(() => {
    syncHouseSetupEightStepGate({ schemaReady: false, remapReady: false });
  });

  it("stays off unless food-rules tables exist AND the setup_step remap is noted", () => {
    expect(HOUSE_SETUP_EIGHT_STEP_FLAG).toBe("houseSetupEightStep");
    syncHouseSetupEightStepGate({ schemaReady: false, remapReady: false });
    expect(isHouseSetupEightStepLive()).toBe(false);
    expect(isSetupStepNineRemapReady()).toBe(false);

    noteFoodRulesSchemaReady(true);
    noteSetupStepNineRemapReady(false);
    expect(isFoodRulesSchemaReady()).toBe(true);
    expect(isHouseSetupEightStepLive()).toBe(false);

    noteFoodRulesSchemaReady(false);
    noteSetupStepNineRemapReady(true);
    expect(isHouseSetupEightStepLive()).toBe(false);

    syncHouseSetupEightStepGate({ schemaReady: true, remapReady: true });
    expect(isHouseSetupEightStepLive()).toBe(true);
    expect(isSetupStepNineRemapReady()).toBe(true);
  });

  it("treats a missing or false setup_eight_step_ready RPC as not remapped", () => {
    expect(SETUP_EIGHT_STEP_READY_RPC).toBe("setup_eight_step_ready");
    expect(parseSetupEightStepReady({ data: true, error: null })).toBe(true);
    expect(parseSetupEightStepReady({ data: false, error: null })).toBe(false);
    expect(parseSetupEightStepReady({ data: true, error: { code: "PGRST202", message: "Could not find the function" } })).toBe(false);
    expect(parseSetupEightStepReady({ data: null, error: { code: "42883", message: "function does not exist" } })).toBe(false);
    expect(parseSetupEightStepReady({ data: null, error: null })).toBe(false);
    expect(parseSetupEightStepReady(null)).toBe(false);
  });
});
