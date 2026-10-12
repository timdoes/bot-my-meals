import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FOOD_RULES_REALTIME_TABLES,
  REALTIME_RESUBSCRIBE_MS,
  REALTIME_TABLES,
  liveRealtimeTables,
  startRealtime,
  type RealtimeClientLike,
} from "./realtime-live";

function fake(opts: { session?: { access_token: string } | null } = {}) {
  const calls: string[] = [];
  let authCb: ((event: string, session: { access_token: string } | null) => void) | null = null;
  const channels: { name: string; tables: string[]; status: ((s: string) => void) | null; fire: (table: string) => void; removed: boolean }[] = [];
  let session = opts.session === undefined ? { access_token: "tok-1" } : opts.session;
  let timerId = 0;
  const timers = new Map<number, () => void>();
  const client: RealtimeClientLike = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: () => void calls.push("auth-unsub") } } };
      },
    },
    realtime: { setAuth: (t) => void calls.push(`setAuth:${t ?? "null"}`) },
    channel: (name) => {
      const handlers = new Map<string, () => void>();
      const rec = { name, tables: [] as string[], status: null as ((s: string) => void) | null, removed: false, fire: (t: string) => handlers.get(t)?.() };
      channels.push(rec);
      const ch = {
        on: (_type: "postgres_changes", filter: { table: string }, cb: () => void) => {
          rec.tables.push(filter.table);
          handlers.set(filter.table, cb);
          return ch;
        },
        subscribe: (cb?: (s: string) => void) => {
          calls.push("subscribe");
          rec.status = cb ?? null;
          return ch;
        },
      };
      return ch as never;
    },
    removeChannel: () => {
      calls.push("removeChannel");
      const last = channels.filter((c) => !c.removed).at(-1);
      if (last) last.removed = true;
    },
  };
  const env = {
    setTimeout: (cb: () => void) => {
      timerId += 1;
      timers.set(timerId, cb);
      return timerId;
    },
    clearTimeout: (id: number) => void timers.delete(id),
  };
  const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };
  return {
    client,
    env,
    calls,
    channels,
    flush,
    auth: (event: string, s: { access_token: string } | null) => authCb?.(event, s),
    setSession: (s: { access_token: string } | null) => {
      session = s;
    },
    runTimers: () => {
      const all = [...timers.values()];
      timers.clear();
      all.forEach((cb) => cb());
    },
    timers: () => timers.size,
  };
}

describe("realtime live", () => {
  it("sets the member token BEFORE subscribing to all live tables", async () => {
    const f = fake();
    const stop = startRealtime({ client: f.client, onChange: vi.fn(), onRestored: vi.fn(), env: f.env });
    await f.flush();
    expect(f.calls.indexOf("setAuth:tok-1")).toBeGreaterThanOrEqual(0);
    expect(f.calls.indexOf("setAuth:tok-1")).toBeLessThan(f.calls.indexOf("subscribe"));
    expect(f.channels).toHaveLength(1);
    expect(f.channels[0]?.tables).toEqual([...REALTIME_TABLES]);
    expect(REALTIME_TABLES).toHaveLength(7);
    expect(f.channels[0]?.tables).toEqual(
      expect.arrayContaining(["ballot_requests", "saved_meals", "meal_dislikes", "weeks", "meals", "votes", "shopping_items"]),
    );
    expect(f.channels[0]?.tables).not.toEqual(expect.arrayContaining(["household_eaters", "food_rules"]));
    expect(FOOD_RULES_REALTIME_TABLES).toHaveLength(5);
    expect(liveRealtimeTables(false)).toEqual([...REALTIME_TABLES]);
    expect(liveRealtimeTables(true)).toEqual([...REALTIME_TABLES, ...FOOD_RULES_REALTIME_TABLES]);
    stop();
  });

  it("does not subscribe without a session", async () => {
    const f = fake({ session: null });
    startRealtime({ client: f.client, onChange: vi.fn(), onRestored: vi.fn(), env: f.env });
    await f.flush();
    expect(f.calls).not.toContain("subscribe");
    f.setSession({ access_token: "late" });
    f.auth("SIGNED_IN", { access_token: "late" });
    await f.flush();
    expect(f.calls).toContain("setAuth:late");
    expect(f.calls).toContain("subscribe");
  });

  it("calls onChange for every event (repeated), and never after stop", async () => {
    const f = fake();
    const onChange = vi.fn();
    const stop = startRealtime({ client: f.client, onChange, onRestored: vi.fn(), env: f.env });
    await f.flush();
    for (let i = 0; i < 12; i += 1) f.channels[0]?.fire("weeks");
    expect(onChange).toHaveBeenCalledTimes(12);
    stop();
    f.channels[0]?.fire("weeks");
    expect(onChange).toHaveBeenCalledTimes(12);
    expect(f.calls).toContain("removeChannel");
    expect(f.calls).toContain("auth-unsub");
  });

  it("pushes a refreshed token without resubscribing", async () => {
    const f = fake();
    startRealtime({ client: f.client, onChange: vi.fn(), onRestored: vi.fn(), env: f.env });
    await f.flush();
    f.auth("TOKEN_REFRESHED", { access_token: "tok-2" });
    await f.flush();
    expect(f.calls.filter((c) => c === "subscribe")).toHaveLength(1);
    expect(f.calls).toContain("setAuth:tok-2");
  });

  it("drops the channel on SIGNED_OUT and resubscribes on the next SIGNED_IN", async () => {
    const f = fake();
    startRealtime({ client: f.client, onChange: vi.fn(), onRestored: vi.fn(), env: f.env });
    await f.flush();
    f.auth("SIGNED_OUT", null);
    await f.flush();
    expect(f.calls).toContain("removeChannel");
    expect(f.calls).toContain("setAuth:null");
    f.setSession({ access_token: "tok-3" });
    f.auth("SIGNED_IN", { access_token: "tok-3" });
    await f.flush();
    expect(f.calls.filter((c) => c === "subscribe")).toHaveLength(2);
  });

  it("refreshes once when the connection is restored, not on the first connect", async () => {
    const f = fake();
    const onRestored = vi.fn();
    const onStatus = vi.fn();
    startRealtime({ client: f.client, onChange: vi.fn(), onRestored, onStatus, env: f.env });
    await f.flush();
    f.channels[0]?.status?.("SUBSCRIBED");
    expect(onRestored).not.toHaveBeenCalled();
    f.channels[0]?.status?.("CHANNEL_ERROR");
    f.channels[0]?.status?.("TIMED_OUT");
    expect(onRestored).not.toHaveBeenCalled();
    f.channels[0]?.status?.("SUBSCRIBED");
    f.channels[0]?.status?.("SUBSCRIBED");
    expect(onRestored).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith({ status: "CHANNEL_ERROR" });
  });

  it("resubscribes after an unexpected CLOSED, with the token set again, then refreshes once", async () => {
    const f = fake();
    const onRestored = vi.fn();
    startRealtime({ client: f.client, onChange: vi.fn(), onRestored, env: f.env });
    await f.flush();
    f.channels[0]?.status?.("SUBSCRIBED");
    f.channels[0]?.status?.("CLOSED");
    expect(REALTIME_RESUBSCRIBE_MS).toBe(5_000);
    expect(f.timers()).toBe(1);
    f.runTimers();
    await f.flush();
    expect(f.channels).toHaveLength(2);
    expect(f.calls.filter((c) => c.startsWith("setAuth:tok-1"))).toHaveLength(2);
    f.channels[1]?.status?.("SUBSCRIBED");
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("stop cancels a pending resubscribe and ignores late events", async () => {
    const f = fake();
    const onRestored = vi.fn();
    const stop = startRealtime({ client: f.client, onChange: vi.fn(), onRestored, env: f.env });
    await f.flush();
    f.channels[0]?.status?.("CLOSED");
    stop();
    expect(f.timers()).toBe(0);
    f.channels[0]?.status?.("SUBSCRIBED");
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("binds food-rules tables only when asked, and a missing-table CHANNEL_ERROR does not add a timer", async () => {
    const core = fake();
    startRealtime({ client: core.client, onChange: vi.fn(), onRestored: vi.fn(), env: core.env });
    await core.flush();
    expect(core.channels[0]?.tables).toEqual([...REALTIME_TABLES]);
    core.channels[0]?.status?.("CHANNEL_ERROR");
    expect(core.timers()).toBe(0);

    const extra = fake();
    startRealtime({
      client: extra.client,
      onChange: vi.fn(),
      onRestored: vi.fn(),
      env: extra.env,
      tables: liveRealtimeTables(true),
    });
    await extra.flush();
    expect(extra.channels[0]?.tables).toEqual([...REALTIME_TABLES, ...FOOD_RULES_REALTIME_TABLES]);
    extra.channels[0]?.status?.("CHANNEL_ERROR");
    expect(extra.timers()).toBe(0);
  });

  it("is wired into the provider and never wakes the bot", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const live = readFileSync(path.join(root, "lib/realtime-live.ts"), "utf8");
    expect(live).not.toMatch(/requestBotWake|[^a-zA-Z]fetch\(|setInterval/);
    const provider = readFileSync(path.join(root, "components/supper-provider.tsx"), "utf8");
    expect(provider).toContain("startRealtime(");
    expect(provider).not.toContain('.channel("supper-live")');
  });
});
