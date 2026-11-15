import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  KEEP_AWAKE_JOIN_TOKEN,
  KEEP_AWAKE_RPC_PATH,
  pingInstallDatabase,
} from "@/lib/keep-awake";

const URL = "https://example.supabase.co";
const ANON = "anon-key-for-tests-only-0123456789abcdef";
const READY_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
};
const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("keep-awake ping", () => {
  it("does one anon peek_join_token read and logs only ok + status", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"status":"invalid"}', { status: 200 }));
    const lines: string[] = [];
    const result = await pingInstallDatabase(READY_ENV, {
      fetchImpl,
      log: (line) => lines.push(line),
    });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL}${KEEP_AWAKE_RPC_PATH}`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ join_token: KEEP_AWAKE_JOIN_TOKEN });
    expect(KEEP_AWAKE_JOIN_TOKEN).not.toMatch(/^[0-9a-f]{32}$/);
    expect(lines).toEqual(["[keep-awake] ok status=200"]);
    expect(lines.join(" ")).not.toContain(ANON);
    expect(lines.join(" ")).not.toContain(URL);
  });

  it("logs fail and the status on an HTTP error, without keys or bodies", async () => {
    const lines: string[] = [];
    const result = await pingInstallDatabase(READY_ENV, {
      fetchImpl: async () => new Response("secret-ish body", { status: 503 }),
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({ ok: false, status: 503, reason: "http_error" });
    expect(lines).toEqual(["[keep-awake] fail status=503"]);
  });

  it("logs fail on a network error", async () => {
    const lines: string[] = [];
    const result = await pingInstallDatabase(READY_ENV, {
      fetchImpl: async () => {
        throw new Error(`boom ${ANON}`);
      },
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({ ok: false, status: null, reason: "network_error" });
    expect(lines).toEqual(["[keep-awake] fail reason=network_error"]);
  });

  it("skips without fetching when the public vars are missing", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    await pingInstallDatabase({}, { fetchImpl, log });
    await pingInstallDatabase(
      { NEXT_PUBLIC_SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "  " },
      { fetchImpl, log },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines).toEqual([
      "[keep-awake] skip reason=config_missing",
      "[keep-awake] skip reason=config_missing",
    ]);
  });

  it("is wired as scheduled() in the Worker entry and does not replace fetch", () => {
    const entry = readFileSync(path.join(repoRoot, "worker.mjs"), "utf8");
    expect(entry).toMatch(/async scheduled\(_controller, env, ctx\)/);
    expect(entry).toContain("ctx.waitUntil(pingInstallDatabase(env))");
    expect(entry).toContain("fetch: openNextWorker.fetch");
    expect(entry).toContain('from "./.open-next/worker.js"');
    expect(entry).not.toMatch(/hardcoded|btvevnmuevrsntawgtim/);
  });
});
