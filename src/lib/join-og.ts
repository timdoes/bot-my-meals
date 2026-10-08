import type { Metadata } from "next";
import { PRODUCT_NAME } from "@/lib/config";

/**
 * Link preview (Open Graph / Twitter card) for the partner invite link /join/<token>.
 * Static and generic on purpose: no house name, no people, no meals, no token.
 * Neutral household copy so the same card fits DIY and hosted houses.
 */
export const JOIN_OG_PATH = "/join";
export const JOIN_OG_TITLE = "You’re invited to plan dinners together";
export const JOIN_OG_DESCRIPTION =
  "Join the household on Bot My Meals. Vote on the week, lock the plan, and share one shopping list.";
export const JOIN_OG_IMAGE_PATH = "/og/join-1200x630.png";
export const JOIN_OG_IMAGE_WIDTH = 1200;
export const JOIN_OG_IMAGE_HEIGHT = 630;
export const JOIN_OG_IMAGE_ALT = "Bot My Meals: plan dinners together";

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

/**
 * Absolute origin for the card from the request Host header. Returns null for a
 * missing or malformed host, so the card never carries an odd URL.
 */
export function joinOgOrigin(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader ?? "").trim().toLowerCase();
  if (!host || host.length > 260 || !HOST_PATTERN.test(host)) return null;
  const hostname = host.replace(/:\d+$/, "");
  return `${isLocalHost(hostname) ? "http" : "https"}://${host}`;
}

/** Canonical /join card for one origin. og:url is always /join, never the token path. */
export function joinOgMetadata(origin: string | null): Metadata {
  const base: Metadata = {
    title: `${JOIN_OG_TITLE} · ${PRODUCT_NAME}`,
    description: JOIN_OG_DESCRIPTION,
    robots: { index: false, follow: false },
  };
  if (!origin) return base;
  const url = `${origin}${JOIN_OG_PATH}`;
  const image = `${origin}${JOIN_OG_IMAGE_PATH}`;
  return {
    ...base,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: PRODUCT_NAME,
      title: JOIN_OG_TITLE,
      description: JOIN_OG_DESCRIPTION,
      url,
      images: [
        {
          url: image,
          secureUrl: origin.startsWith("https://") ? image : undefined,
          type: "image/png",
          width: JOIN_OG_IMAGE_WIDTH,
          height: JOIN_OG_IMAGE_HEIGHT,
          alt: JOIN_OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: JOIN_OG_TITLE,
      description: JOIN_OG_DESCRIPTION,
      images: [{ url: image, alt: JOIN_OG_IMAGE_ALT }],
    },
  };
}

/** Bare /join (the card's canonical URL) has no token, so it only points back to the link. */
export const JOIN_BARE_BODY =
  "Open the invite link you were sent to join the household. No link yet? Ask the person who invited you to share it again. There is no code to paste here.";
