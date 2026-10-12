/** Tables added by food-rules migrations. Live DBs may not have them yet. */
export const FOOD_RULES_SNAPSHOT_TABLES = [
  "household_eaters",
  "food_rules",
  "week_night_lists",
  "week_night_attendees",
  "recipe_food_holds",
] as const;

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

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

export function isFoodRulesSchemaReady(): boolean {
  return foodRulesSchemaReady;
}

export function noteFoodRulesSchemaReady(ready: boolean): void {
  foodRulesSchemaReady = ready;
}
