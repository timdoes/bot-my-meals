import type { Metadata } from "next";
import { headers } from "next/headers";
import { JoinLanding } from "@/components/join-landing";
import { joinOgMetadata, joinOgOrigin } from "@/lib/join-og";

/** Generic invite card. Never reads the token or the house, so nothing private unfurls. */
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  return joinOgMetadata(joinOgOrigin(requestHeaders.get("host")));
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinLanding token={token} />;
}
