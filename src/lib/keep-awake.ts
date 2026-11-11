/**
 * Daily keep-awake ping for a DIY Supabase Free project (pauses after 7 idle days).
 * worker.mjs wires this to the `triggers.crons` entry in wrangler.jsonc.
 *
 * One cheap anon read: POST /rest/v1/rpc/peek_join_token with a sentinel that can
 * never be a minted join token (those are 32 hex chars). The RPC SELECTs
 * household_join_tokens, so the request reaches Postgres, not only the API gateway.
 * Logs only ok/skip/fail and the HTTP status. Never logs keys, headers, URLs, or bodies.
 *
 * Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY is a clean skip
 * so the OSS template still works before those vars are set.
 */
export const KEEP_AWAKE_JOIN_TOKEN = "keep-awake";
export const KEEP_AWAKE_RPC_PATH = "/rest/v1/rpc/peek_join_token";
export const KEEP_AWAKE_TIMEOUT_MS = 10_000;

export type KeepAwakeResult =
  | { ok: true; status: number }
  | { ok: true; skipped: true }
  | { ok: false; status: number | null; reason: "http_error" | "network_error" };

type EnvLike = Record<string, unknown>;

function envString(env: EnvLike, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export async function pingInstallDatabase(
  env: EnvLike,
  options: { fetchImpl?: typeof fetch; log?: (line: string) => void } = {},
): Promise<KeepAwakeResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = envString(env, "NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const anonKey = envString(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    log("[keep-awake] skip reason=config_missing");
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetchImpl(`${url}${KEEP_AWAKE_RPC_PATH}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ join_token: KEEP_AWAKE_JOIN_TOKEN }),
      redirect: "manual",
      signal: AbortSignal.timeout(KEEP_AWAKE_TIMEOUT_MS),
    });
    // Drain the body so the connection closes; the value is not logged.
    await response.text().catch(() => "");
    if (response.ok) {
      log(`[keep-awake] ok status=${response.status}`);
      return { ok: true, status: response.status };
    }
    log(`[keep-awake] fail status=${response.status}`);
    return { ok: false, status: response.status, reason: "http_error" };
  } catch {
    log("[keep-awake] fail reason=network_error");
    return { ok: false, status: null, reason: "network_error" };
  }
}
