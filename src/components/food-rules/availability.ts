import { isFoodRulesSchemaReady } from "@/lib/supabase/missing-schema";

/**
 * True only after a snapshot proved the food-rules tables exist.
 * F0 sets this in repo.ts (`noteFoodRulesSchemaReady`). Missing schema
 * stays false, so House and Never again look exactly as they do today.
 */
export function isFoodRulesAvailable(): boolean {
  return isFoodRulesSchemaReady();
}
