import {
  householdHostFromRequest,
  parseWakeEvent,
  postBotWake,
  sharedWakeDebounce,
  wakeAllowed,
  type WakeEvent,
} from "@/lib/bot-wake";
import { botWakeConfiguredResponse, requireMember, wakeJson } from "@/lib/bot-wake-http";
import { readBotWakeSecrets, saveBotWakeSecrets } from "@/lib/bot-wake-secret";
import { supabaseBotCheckStatus, supabaseCurrentWeekLocked } from "@/lib/supabase/repo";
import { isAdmin } from "@/lib/users";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function wakeFacts(
  client: SupabaseClient,
  householdId: string,
  event: WakeEvent,
): Promise<{ weekLocked: boolean; needsWork: boolean }> {
  switch (event) {
    case "check_now":
      return { weekLocked: false, needsWork: false };
    case "week_locked":
      return { weekLocked: await supabaseCurrentWeekLocked(client, householdId), needsWork: false };
    case "needs_work": {
      const status = await supabaseBotCheckStatus(client);
      return { weekLocked: false, needsWork: status.ok && status.body.needs_work };
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

// TODO: remove GET after one release. Tabs still running old JS call GET /api/bot/wake
// to read configured. New clients use GET /api/bot/wake-config. POST and PUT stay here.
export async function GET(request: Request) {
  return botWakeConfiguredResponse(request);
}

export async function POST(request: Request) {
  const auth = await requireMember(request);
  if (auth.response || !auth.session || !auth.client) {
    return auth.response ?? wakeJson({ error: "unauthorized" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return wakeJson({ error: "unknown event" }, 400);
  }
  const event = parseWakeEvent(
    payload != null && typeof payload === "object" && "event" in payload ? payload.event : null,
  );
  if (!event) return wakeJson({ error: "unknown event" }, 400);

  const householdId = auth.session.householdId;
  if (!householdId) return wakeJson({ error: "unauthorized" }, 401);

  try {
    const facts = await wakeFacts(auth.client, householdId, event);
    if (!wakeAllowed(event, facts)) return wakeJson({ posted: false, reason: "skipped" });
    const secrets = readBotWakeSecrets();
    const result = await postBotWake({
      event,
      householdHost: householdHostFromRequest(request),
      url: secrets.url,
      key: secrets.key,
      debounce: sharedWakeDebounce,
    });
    return wakeJson({ posted: result.posted, reason: result.reason });
  } catch {
    console.warn(`[bot-wake] ${event} soft-fail`);
    return wakeJson({ posted: false, reason: "failed" });
  }
}

export async function PUT(request: Request) {
  const auth = await requireMember(request);
  if (auth.response || !auth.session) return auth.response ?? wakeJson({ error: "unauthorized" }, 401);
  if (!isAdmin(auth.session.role)) {
    return wakeJson({ error: "Only an Admin can save the bot webhook." }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return wakeJson({ error: "Paste an https webhook URL." }, 400);
  }
  if (payload == null || typeof payload !== "object") {
    return wakeJson({ error: "Paste an https webhook URL." }, 400);
  }
  const url = "url" in payload && typeof payload.url === "string" ? payload.url : "";
  const key = "key" in payload && typeof payload.key === "string" ? payload.key : undefined;
  const saved = await saveBotWakeSecrets({ url, key });
  if (!saved.ok) {
    const status = saved.error.startsWith("Paste") ? 400 : 502;
    return wakeJson({ error: saved.error }, status);
  }
  return wakeJson({ configured: true });
}
