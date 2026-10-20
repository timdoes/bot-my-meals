import { NextResponse } from "next/server";
import { readBotWakeSecrets } from "@/lib/bot-wake-secret";
import { fetchSupabaseSession } from "@/lib/supabase/repo";
import { createSupabaseForRequest } from "@/lib/supabase/server";

export function wakeJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function requireMember(request: Request) {
  const client = await createSupabaseForRequest(request);
  if (!client) return { client: null, session: null, response: wakeJson({ error: "unavailable" }, 503) };
  try {
    const session = await fetchSupabaseSession(client);
    if (!session?.householdId) {
      return { client, session: null, response: wakeJson({ error: "unauthorized" }, 401) };
    }
    return { client, session, response: null };
  } catch {
    return { client, session: null, response: wakeJson({ error: "unauthorized" }, 401) };
  }
}

export async function botWakeConfiguredResponse(request: Request) {
  const auth = await requireMember(request);
  if (auth.response || !auth.session) return auth.response ?? wakeJson({ error: "unauthorized" }, 401);
  return wakeJson({ configured: readBotWakeSecrets().configured });
}
