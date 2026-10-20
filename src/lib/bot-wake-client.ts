import { BOT_WAKE_SAVE_ERROR, type WakeEvent } from "@/lib/bot-wake";

export const WAKE_CLIENT_RESULTS = ["posted", "debounced", "unset", "skipped", "failed"] as const;
export type WakeClientResult = (typeof WAKE_CLIENT_RESULTS)[number];

function parseWakeClientResult(value: unknown): WakeClientResult {
  switch (value) {
    case "posted":
    case "debounced":
    case "unset":
    case "skipped":
    case "failed":
      return value;
    default:
      return "failed";
  }
}

export async function requestBotWake(event: WakeEvent): Promise<WakeClientResult> {
  try {
    const response = await fetch("/api/bot/wake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ event }),
    });
    if (!response.ok) return "failed";
    const body: unknown = await response.json();
    if (body != null && typeof body === "object" && "posted" in body && body.posted === true) {
      return "posted";
    }
    const reason =
      body != null && typeof body === "object" && "reason" in body ? body.reason : "failed";
    return parseWakeClientResult(reason);
  } catch {
    return "failed";
  }
}

let configuredRead: Promise<boolean> | null = null;

export function resetBotWakeConfiguredCache(): void {
  configuredRead = null;
}

export function rememberBotWakeConfigured(configured: boolean): void {
  configuredRead = Promise.resolve(configured);
}

async function loadBotWakeConfigured(): Promise<boolean> {
  try {
    const response = await fetch("/api/bot/wake-config", { credentials: "same-origin" });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return body != null && typeof body === "object" && "configured" in body && body.configured === true;
  } catch {
    return false;
  }
}

export async function fetchBotWakeConfigured(): Promise<boolean> {
  configuredRead ??= loadBotWakeConfigured();
  return configuredRead;
}

export async function saveBotWakeSettings(input: {
  url: string;
  key: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/bot/wake", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        url: input.url,
        ...(input.key.trim() ? { key: input.key } : {}),
      }),
    });
    if (!response.ok) return { ok: false, message: BOT_WAKE_SAVE_ERROR };
    return { ok: true };
  } catch {
    return { ok: false, message: BOT_WAKE_SAVE_ERROR };
  }
}
