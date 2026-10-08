import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { HouseCard } from "@/components/house-card";
import { JOIN_TITLE } from "@/lib/join";
import { JOIN_BARE_BODY, joinOgMetadata, joinOgOrigin } from "@/lib/join-og";

/** Canonical og:url target for invite cards. Same generic card, no token. */
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  return joinOgMetadata(joinOgOrigin(requestHeaders.get("host")));
}

export default function JoinBarePage() {
  return (
    <AppShell title={JOIN_TITLE} eyebrow="Bot My Meals" hideNav>
      <HouseCard data-slot="join-bare">
        <p className="type-body text-muted-foreground">{JOIN_BARE_BODY}</p>
      </HouseCard>
    </AppShell>
  );
}
