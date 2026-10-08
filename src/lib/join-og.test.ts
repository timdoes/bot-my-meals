import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  JOIN_BARE_BODY,
  JOIN_OG_DESCRIPTION,
  JOIN_OG_IMAGE_HEIGHT,
  JOIN_OG_IMAGE_PATH,
  JOIN_OG_IMAGE_WIDTH,
  JOIN_OG_TITLE,
  joinOgMetadata,
  joinOgOrigin,
} from "./join-og";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const srcRoot = path.resolve(import.meta.dirname, "..");

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("join invite link preview", () => {
  it("uses neutral, household copy that fits DIY and hosted houses", () => {
    for (const copy of [JOIN_OG_TITLE, JOIN_OG_DESCRIPTION, JOIN_BARE_BODY]) {
      expect(copy).not.toMatch(/grok/i);
      expect(copy).not.toMatch(/grandma|grandparent|phone|iphone|android|tablet|laptop/i);
    }
    expect(JOIN_OG_TITLE).toMatch(/plan dinners together/i);
  });

  it("ships a 1200x630 PNG card under /og (static asset, outside the proxy)", () => {
    expect(JOIN_OG_IMAGE_PATH).toBe("/og/join-1200x630.png");
    const size = pngSize(path.join(repoRoot, "public", JOIN_OG_IMAGE_PATH));
    expect(size).toEqual({ width: JOIN_OG_IMAGE_WIDTH, height: JOIN_OG_IMAGE_HEIGHT });
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it("derives an absolute origin from a clean Host header only", () => {
    expect(joinOgOrigin("timdoes.botmymeals.com")).toBe("https://timdoes.botmymeals.com");
    expect(joinOgOrigin("My-House.Example.com")).toBe("https://my-house.example.com");
    expect(joinOgOrigin("localhost:43147")).toBe("http://localhost:43147");
    expect(joinOgOrigin("127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(joinOgOrigin(null)).toBeNull();
    expect(joinOgOrigin("")).toBeNull();
    expect(joinOgOrigin("evil.com/<script>")).toBeNull();
    expect(joinOgOrigin('a.com" onload="x')).toBeNull();
    expect(joinOgOrigin("a.com/join/abc")).toBeNull();
  });

  it("builds a static card: absolute image, canonical /join, summary_large_image", () => {
    const meta = joinOgMetadata("https://timdoes.botmymeals.com");
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.url).toBe("https://timdoes.botmymeals.com/join");
    expect(og.title).toBe(JOIN_OG_TITLE);
    expect(og.description).toBe(JOIN_OG_DESCRIPTION);
    const [image] = og.images as Array<Record<string, unknown>>;
    expect(image.url).toBe("https://timdoes.botmymeals.com/og/join-1200x630.png");
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.type).toBe("image/png");
    const twitter = meta.twitter as Record<string, unknown>;
    expect(twitter.card).toBe("summary_large_image");
    expect(meta.alternates?.canonical).toBe("https://timdoes.botmymeals.com/join");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("drops absolute URLs when the host is unusable", () => {
    const meta = joinOgMetadata(null);
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
    expect(meta.description).toBe(JOIN_OG_DESCRIPTION);
  });

  it("never reads the token or house data for the card", () => {
    for (const rel of ["app/join/[token]/page.tsx", "app/join/page.tsx"]) {
      const source = readFileSync(path.join(srcRoot, rel), "utf8");
      const meta = source.slice(source.indexOf("generateMetadata"), source.indexOf("export default"));
      expect(meta).toContain("joinOgMetadata(joinOgOrigin(");
      expect(meta).not.toMatch(/params|token|household|peek|supabase/i);
    }
  });
});

describe("join card image stays outside the proxy", () => {
  it("excludes /og/ from the proxy matcher like /brand/", () => {
    const proxy = readFileSync(path.join(srcRoot, "proxy.ts"), "utf8");
    expect(proxy).toMatch(/\|brand\/\|og\/\|/);
  });
});
