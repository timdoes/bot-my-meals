/** Tables added by food-rules migrations. Live DBs may not have them yet. */
export const FOOD_RULES_SNAPSHOT_TABLES = [
  "household_eaters",
  "food_rules",
  "week_night_lists",
  "week_night_attendees",
  "recipe_food_holds",
] as const;

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST205", "PGRST202", "42883"]);

/**
 * PostgREST/Postgres "this table or function is not on this database yet".
 * Live public Worker can deploy before Cos applies the food-rules migrations.
 */
export function isMissingSchemaError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the function")
  );
}

export type OptionalTableRead<T> = {
  rows: T[];
  ready: boolean;
};

/** Missing relation/function → empty, no throw. Other errors on these new tables also stay quiet. */
export function optionalFoodRulesRows<T>(
  result: { data?: unknown; error?: { code?: string | null; message?: string | null } | null } | null | undefined,
  parse: (rows: unknown) => T[],
): OptionalTableRead<T> {
  if (!result || result.error) {
    return { rows: [], ready: false };
  }
  return { rows: parse(result.data ?? []), ready: true };
}

let foodRulesSchemaReady = false;
let setupStepNineRemapReady = false;

export function isFoodRulesSchemaReady(): boolean {
  return foodRulesSchemaReady;
}

export function noteFoodRulesSchemaReady(ready: boolean): void {
  foodRulesSchemaReady = ready;
}

/**
 * Snapshot flag for 8-step house setup.
 * Live only when food-rules tables exist AND `setup_eight_step_ready()`
 * is true (the remap marker from `20261011224500_setup_step_nine_remap`).
 * Missing function or false keeps today's 7-step numbering (8 = done).
 */
export const HOUSE_SETUP_EIGHT_STEP_FLAG = "houseSetupEightStep";

export function isSetupStepNineRemapReady(): boolean {
  return setupStepNineRemapReady;
}

export function noteSetupStepNineRemapReady(ready: boolean): void {
  setupStepNineRemapReady = ready;
}

/** True only after a snapshot proved tables exist and the setup_step remap ran. */
export function isHouseSetupEightStepLive(): boolean {
  return foodRulesSchemaReady && setupStepNineRemapReady;
}

/** RPC that reads the remap marker. Missing function (PGRST202/42883) keeps 7-step. */
export const SETUP_EIGHT_STEP_READY_RPC = "setup_eight_step_ready";

/** Missing function / false / error → 7-step. `true` only after remap is marked. */
export function parseSetupEightStepReady(
  result: { data?: unknown; error?: { code?: string | null; message?: string | null } | null } | null | undefined,
): boolean {
  if (!result || result.error) return false;
  return result.data === true;
}

export function syncHouseSetupEightStepGate(input: {
  schemaReady: boolean;
  remapReady: boolean;
}): boolean {
  noteFoodRulesSchemaReady(input.schemaReady);
  noteSetupStepNineRemapReady(input.remapReady);
  return isHouseSetupEightStepLive();
}
