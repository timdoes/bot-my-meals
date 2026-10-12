/**
 * Live updates over Supabase Realtime, signed in as the member.
 *
 * Why this exists: a cookie-restored browser session fires INITIAL_SESSION, which does not
 * push the access token to Realtime. The channel then joins as the anon key, row security
 * hides every row from it, and no event is ever delivered. So the token is set on Realtime
 * before subscribing, and again on every auth change.
 *
 * Read only: a change event rereads saved data through `onChange`. It never wakes the bot.
 * The only timer is the short retry after an unexpected CLOSED.
 */
export const REALTIME_TABLES = [
  "votes",
  "meals",
  "weeks",
  "shopping_items",
  "ballot_requests",
  "saved_meals",
  "meal_dislikes",
  "household_eaters",
  "food_rules",
  "week_night_lists",
  "week_night_attendees",
  "recipe_food_holds",
] as const;

export const REALTIME_RESUBSCRIBE_MS = 5_000;

type SessionLike = { access_token: string } | null;

type ChannelLike = {
  on: (type: "postgres_changes", filter: { event: "*"; schema: "public"; table: string }, cb: () => void) => ChannelLike;
  subscribe: (cb?: (status: string) => void) => ChannelLike;
};

export type RealtimeClientLike = {
  auth: {
    getSession: () => Promise<{ data: { session: SessionLike } }>;
    onAuthStateChange: (cb: (event: string, session: SessionLike) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
  realtime: { setAuth: (token?: string | null) => void | Promise<void> };
  channel: (name: string) => ChannelLike;
  removeChannel: (channel: ChannelLike) => unknown;
};

export type RealtimeEnv = {
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

const browserEnv: RealtimeEnv = {
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

export type RealtimeStatusEvent = { status: string };

export function startRealtime(input: {
  client: RealtimeClientLike;
  onChange: () => void;
  /** Called once each time the connection comes back after being lost. */
  onRestored: () => void;
  onStatus?: (event: RealtimeStatusEvent) => void;
  env?: RealtimeEnv;
}): () => void {
  const { client } = input;
  const env = input.env ?? browserEnv;
  let stopped = false;
  let channel: ChannelLike | null = null;
  let lost = false;
  let retry: number | null = null;
  let generation = 0;

  const clearRetry = () => {
    if (retry == null) return;
    env.clearTimeout(retry);
    retry = null;
  };

  const drop = () => {
    clearRetry();
    generation += 1;
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
    }
  };

  const subscribe = () => {
    if (stopped || channel) return;
    const mine = ++generation;
    let next = client.channel("supper-live");
    for (const table of REALTIME_TABLES) {
      next = next.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (!stopped && mine === generation) input.onChange();
      });
    }
    channel = next.subscribe((status) => {
      if (stopped || mine !== generation) return;
      input.onStatus?.({ status });
      if (status === "SUBSCRIBED") {
        if (lost) {
          lost = false;
          input.onRestored();
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // supabase-js rejoins on its own; the next SUBSCRIBED is a restore.
        lost = true;
        return;
      }
      if (status === "CLOSED") {
        lost = true;
        drop();
        clearRetry();
        retry = env.setTimeout(() => {
          retry = null;
          void begin();
        }, REALTIME_RESUBSCRIBE_MS);
      }
    });
  };

  const begin = async () => {
    if (stopped || channel) return;
    try {
      const { data } = await client.auth.getSession();
      if (stopped) return;
      if (!data.session) return;
      await client.realtime.setAuth(data.session.access_token);
    } catch {
      return;
    }
    if (stopped) return;
    subscribe();
  };

  const { data: listener } = client.auth.onAuthStateChange((event, session) => {
    if (stopped) return;
    if (event === "SIGNED_OUT") {
      drop();
      lost = false;
      void client.realtime.setAuth(null);
      return;
    }
    if (session?.access_token && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
      void Promise.resolve(client.realtime.setAuth(session.access_token)).then(() => {
        if (!stopped && !channel) void begin();
      });
    }
  });

  void begin();

  return () => {
    stopped = true;
    listener.subscription.unsubscribe();
    drop();
  };
}
