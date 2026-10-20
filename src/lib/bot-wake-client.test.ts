import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBotWakeConfigured,
  rememberBotWakeConfigured,
  resetBotWakeConfiguredCache,
} from "@/lib/bot-wake-client";

const srcRoot = path.resolve(import.meta.dirname, "..");

afterEach(() => {
  resetBotWakeConfiguredCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function walkSrcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api" && path.basename(dir) === "app") continue;
      out.push(...walkSrcFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    out.push(full);
  }
  return out;
}

function clientWakeFetches(source: string): Array<{ method: string | null }> {
  const hits: Array<{ method: string | null }> = [];
  const re = /fetch\(\s*(["'`])(\/api\/bot\/wake(?:\?[^"'`]*)?)\1/g;
  let match = re.exec(source);
  while (match) {
    const url = match[2];
    if (url.startsWith("/api/bot/wake-") || url.startsWith("/api/bot/wake/")) {
      match = re.exec(source);
      continue;
    }
    const rest = source.slice(match.index + match[0].length).trimStart();
    if (!rest.startsWith(",")) {
      hits.push({ method: null });
      match = re.exec(source);
      continue;
    }
    const initStart = source.indexOf("{", match.index + match[0].length);
    const initSlice = initStart >= 0 ? source.slice(initStart, initStart + 500) : "";
    const methodMatch = /method:\s*["']([A-Za-z]+)["']/.exec(initSlice);
    hits.push({ method: methodMatch ? methodMatch[1].toUpperCase() : null });
    match = re.exec(source);
  }
  return hits;
}

describe("fetchBotWakeConfigured cache", () => {
  it("shares one in-flight /api/bot/wake-config fetch across concurrent callers", async () => {
    let release!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchBotWakeConfigured();
    const second = fetchBotWakeConfigured();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/bot/wake-config", { credentials: "same-origin" });

    release(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await fetchBotWakeConfigured()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after reset and skips the network after remember", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ configured: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchBotWakeConfigured()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rememberBotWakeConfigured(true);
    expect(await fetchBotWakeConfigured()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetBotWakeConfiguredCache();
    expect(await fetchBotWakeConfigured()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("wake URL is POST from the client", () => {
  it("only POSTs or PUTs /api/bot/wake from client source", () => {
    const files = walkSrcFiles(srcRoot);
    const hits: Array<{ file: string; method: string | null }> = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const hit of clientWakeFetches(source)) {
        hits.push({ file: path.relative(srcRoot, file), method: hit.method });
      }
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.method === "POST" || hit.method === "PUT")).toBe(true);
    expect(hits.some((hit) => hit.method === "POST")).toBe(true);
    expect(hits.some((hit) => hit.file.endsWith("bot-wake-client.ts") && hit.method === "PUT")).toBe(
      true,
    );
  });

  it("reads configured from GET /api/bot/wake-config and keeps deprecated GET /api/bot/wake", () => {
    const client = readFileSync(path.join(srcRoot, "lib/bot-wake-client.ts"), "utf8");
    const wake = readFileSync(path.join(srcRoot, "app/api/bot/wake/route.ts"), "utf8");
    const config = readFileSync(path.join(srcRoot, "app/api/bot/wake-config/route.ts"), "utf8");
    const settings = readFileSync(path.join(srcRoot, "components/bot-wake-settings.tsx"), "utf8");
    const provider = readFileSync(path.join(srcRoot, "components/supper-provider.tsx"), "utf8");

    expect(client).toContain('fetch("/api/bot/wake-config"');
    expect(client).not.toMatch(/fetch\(\s*["'`]\/api\/bot\/wake["'`]\s*,\s*\{\s*credentials/);
    expect(config).toContain("botWakeConfiguredResponse");
    expect(config).toContain("export async function GET");
    expect(config).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(wake).toMatch(/TODO: remove GET after one release/);
    expect(wake).toContain("export async function GET");
    expect(wake).toContain("export async function POST");
    expect(wake).toContain("export async function PUT");
    expect(settings).toContain("wakeConfigured={configured ?? undefined}");
    expect(provider).toContain("resetBotWakeConfiguredCache");
  });
});
