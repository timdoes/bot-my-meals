import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUSEHOLD_NOT_VISIBLE,
  fetchSupabaseSession,
  fetchSupabaseSnapshot,
  supabaseCreateHousehold,
  supabaseMarkFoodRulesReviewed,
} from "./repo";
import {
  FOOD_RULES_SNAPSHOT_TABLES,
  SETUP_EIGHT_STEP_READY_RPC,
  isFoodRulesSchemaReady,
  isHouseSetupEightStepLive,
  syncHouseSetupEightStepGate,
} from "./missing-schema";
import type { Session } from "@/lib/types";
import { resetRpcMissingForTests } from "./missing-schema";

const user = {
  id: "user-1",
  email: "admin@example.com",
  user_metadata: { display_name: "admin" },
};

function createClient(options: {
  rpc?: (fn: string, args?: { household_name?: string }) => Promise<{ data: unknown; error: { message: string } | null }>;
  membership?: { data: { id: string; household_id: string; role: string; display_name: string; email: string } | null; error: { message: string } | null };
}): SupabaseClient {
  const rpc = options.rpc ?? (async () => ({ data: "hid", error: null }));
  const membership = options.membership ?? {
    data: {
      id: "mem-1",
      household_id: "hid",
      role: "owner",
      display_name: "admin",
      email: "admin@example.com",
    },
    error: null,
  };

  return {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    rpc,
    from: (table: string) => {
      if (table !== "memberships") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => membership,
              }),
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("supabaseCreateHousehold", () => {
  it("rejects an empty name instead of inserting NULL", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(supabaseCreateHousehold(createClient({ rpc }), "   ")).rejects.toThrow(
      "Give the household a name.",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC failures instead of succeeding silently", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "create_household") {
        return { data: null, error: { message: "Not authenticated" } };
      }
      return { data: null, error: null };
    });
    await expect(supabaseCreateHousehold(createClient({ rpc }), "Home")).rejects.toThrow(
      "Not authenticated",
    );
  });

  it("surfaces the RLS read failure that made Create household look dead", async () => {
    const rpc = vi.fn(async (fn: string, args?: { household_name?: string }) => {
      if (fn === "create_household") {
        expect(args).toEqual({ household_name: "Home" });
        return { data: "hid", error: null };
      }
      return { data: null, error: null };
    });
    await expect(
      supabaseCreateHousehold(
        createClient({
          rpc,
          membership: {
            data: null,
            error: { message: "permission denied for schema private" },
          },
        }),
        "Home",
      ),
    ).rejects.toThrow("permission denied for schema private");
  });

  it("does not treat a successful insert as done when the household is still invisible", async () => {
    await expect(
      supabaseCreateHousehold(
        createClient({
          membership: { data: null, error: null },
        }),
        "Home",
      ),
    ).rejects.toThrow(HOUSEHOLD_NOT_VISIBLE);
  });

  it("accepts a valid name when the new household is readable", async () => {
    await expect(supabaseCreateHousehold(createClient({}), "Home")).resolves.toBeUndefined();
  });
});

describe("fetchSupabaseSession", () => {
  it("does not swallow membership read errors as 'no household yet'", async () => {
    await expect(
      fetchSupabaseSession(
        createClient({
          membership: {
            data: null,
            error: { message: "permission denied for schema private" },
          },
        }),
      ),
    ).rejects.toThrow("permission denied for schema private");
  });
});

type QueryError = { code?: string; message: string };

function thenable(result: { data: unknown; error: QueryError | null }) {
  const self = {
    select: () => self,
    eq: () => self,
    order: () => self,
    limit: () => self,
    is: () => self,
    gt: () => self,
    in: () => self,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: { data: unknown; error: QueryError | null }) => unknown, reject?: (err: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return self;
}

const householdRow = {
  id: "hid",
  name: "House A",
  invite_code: "ABC123",
  week_starts_on: 0,
  couple_nights: [5, 6],
  family_size: 4,
  couple_size: 2,
  night_headcounts: [4, 4, 4, 4, 4, 2, 2],
  timezone: "America/Los_Angeles",
  setup_step: 8,
  weekly_budget_cents: null,
  household_size: 4,
  nights_planned: 7,
  postal_code: null,
  bot_check_mode: "adaptive",
  bot_check_interval_hours: null,
};

const weekRow = {
  id: "week-1",
  household_id: "hid",
  starts_on: "2026-10-11",
  status: "voting",
  locked_at: null,
  editable_from: null,
  shopping_prompt: "open",
  people_confirmed_at: null,
  night_headcounts: null,
  special_instructions: null,
};

const snapshotSession: Session = {
  userId: "user-1",
  email: "alex@example.com",
  displayName: "Alex",
  membershipId: "mem-1",
  householdId: "hid",
  role: "owner",
};

function snapshotClient(options: {
  foodRulesError: QueryError | null;
  foodRulesData?: unknown[];
  setupStep?: number;
  eightStepReady?: { data?: unknown; error?: QueryError | null };
}) {
  const fromCalls: string[] = [];
  const rpcCalls: string[] = [];
  const missing = options.foodRulesError;
  const foodRows = options.foodRulesData ?? [];
  const client = {
    from: (table: string) => {
      fromCalls.push(table);
      if ((FOOD_RULES_SNAPSHOT_TABLES as readonly string[]).includes(table)) {
        return thenable({ data: missing ? null : foodRows, error: missing });
      }
      switch (table) {
        case "households":
          return thenable({
            data: { ...householdRow, setup_step: options.setupStep ?? householdRow.setup_step },
            error: null,
          });
        case "weeks":
          return thenable({ data: [weekRow], error: null });
        case "memberships":
          return thenable({
            data: [
              {
                id: "mem-1",
                household_id: "hid",
                user_id: "user-1",
                role: "owner",
                display_name: "Alex",
                email: "alex@example.com",
              },
            ],
            error: null,
          });
        default:
          return thenable({ data: [], error: null });
      }
    },
    rpc: async (fn: string) => {
      rpcCalls.push(fn);
      if (fn === SETUP_EIGHT_STEP_READY_RPC) {
        const ready = options.eightStepReady;
        if (ready?.error) return { data: ready.data ?? null, error: ready.error };
        if (ready && "data" in ready) return { data: ready.data, error: null };
        return { data: false, error: null };
      }
      return { data: [], error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, fromCalls, rpcCalls };
}

afterEach(() => {
  resetRpcMissingForTests();
  syncHouseSetupEightStepGate({ schemaReady: false, remapReady: false });
});

describe("fetchSupabaseSnapshot food-rules live-safety", () => {
  it("treats missing food-rules tables as empty and leaves existing snapshot fields unchanged", async () => {
    const missing = snapshotClient({
      foodRulesError: {
        code: "PGRST205",
        message: "Could not find the table 'public.food_rules' in the schema cache",
      },
    });
    const snapshot = await fetchSupabaseSnapshot(missing.client, snapshotSession);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.eaters).toEqual([]);
    expect(snapshot?.foodRules).toEqual([]);
    expect(snapshot?.nightLists).toEqual([]);
    expect(snapshot?.nightAttendees).toEqual([]);
    expect(snapshot?.foodHolds).toEqual([]);
    expect(snapshot?.household.id).toBe("hid");
    expect(snapshot?.household.name).toBe("House A");
    expect(snapshot?.week.id).toBe("week-1");
    expect(snapshot?.meals).toEqual([]);
    expect(snapshot?.votes).toEqual([]);
    expect(snapshot?.savedMeals).toEqual([]);
    expect(snapshot?.mealDislikes).toEqual([]);
    expect(isFoodRulesSchemaReady()).toBe(false);
    for (const table of FOOD_RULES_SNAPSHOT_TABLES) {
      expect(missing.fromCalls.filter((name) => name === table)).toHaveLength(1);
    }
    expect(missing.rpcCalls).toEqual(["meal_history", SETUP_EIGHT_STEP_READY_RPC]);
  });

  it("also swallows 42P01 and PGRST202 without a second query", async () => {
    for (const code of ["42P01", "PGRST202"] as const) {
      const missing = snapshotClient({
        foodRulesError: { code, message: "relation public.household_eaters does not exist" },
      });
      const snapshot = await fetchSupabaseSnapshot(missing.client, snapshotSession);
      expect(snapshot?.foodRules).toEqual([]);
      expect(snapshot?.eaters).toEqual([]);
      expect(isFoodRulesSchemaReady()).toBe(false);
      expect(missing.fromCalls.filter((name) => name === "food_rules")).toHaveLength(1);
    }
  });

  it("marks the schema ready when the new tables return rows", async () => {
    const present = snapshotClient({ foodRulesError: null, foodRulesData: [] });
    const snapshot = await fetchSupabaseSnapshot(present.client, snapshotSession);
    expect(snapshot?.eaters).toEqual([]);
    expect(isFoodRulesSchemaReady()).toBe(true);
    expect(isHouseSetupEightStepLive()).toBe(false);
  });

  it("keeps 7-step numbering when tables exist but setup_eight_step_ready is missing or false", async () => {
    for (const eightStepReady of [
      { data: false, error: null },
      { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
      { data: null, error: { code: "42883", message: "function public.setup_eight_step_ready() does not exist" } },
    ] as const) {
      syncHouseSetupEightStepGate({ schemaReady: false, remapReady: false });
      const present = snapshotClient({
        foodRulesError: null,
        foodRulesData: [],
        setupStep: 7,
        eightStepReady,
      });
      await fetchSupabaseSnapshot(present.client, snapshotSession);
      expect(isFoodRulesSchemaReady()).toBe(true);
      expect(isHouseSetupEightStepLive()).toBe(false);
    }
  });

  it("turns on 8-step numbering only when tables exist and setup_eight_step_ready is true", async () => {
    const present = snapshotClient({
      foodRulesError: null,
      foodRulesData: [],
      setupStep: 8,
      eightStepReady: { data: true, error: null },
    });
    await fetchSupabaseSnapshot(present.client, snapshotSession);
    expect(isFoodRulesSchemaReady()).toBe(true);
    expect(isHouseSetupEightStepLive()).toBe(true);
  });
});

describe("supabaseMarkFoodRulesReviewed", () => {
  it("calls set_food_rules_reviewed with the signed-in household", async () => {
    const rpc = vi.fn(async (fn: string, args?: { p_household_id?: string }) => {
      expect(fn).toBe("set_food_rules_reviewed");
      expect(args).toEqual({ p_household_id: "hid" });
      return { data: null, error: null };
    });
    await supabaseMarkFoodRulesReviewed(
      { rpc } as unknown as SupabaseClient,
      snapshotSession,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

