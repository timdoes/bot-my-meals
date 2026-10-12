"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { PAST_WEEKS_LABEL } from "@/lib/meal-history";
import { PAST_TITLES_ONLY, navigatorHref } from "@/lib/week-navigator";

export default function PastWeekPage({ params }: { params: Promise<{ startsOn: string }> }) {
  const { startsOn } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(navigatorHref({ kind: "past", startsOn }));
  }, [router, startsOn]);

  return (
    <AuthGate>
      <AppShell title={PAST_WEEKS_LABEL} backHref="/house/past-weeks" backLabel={PAST_WEEKS_LABEL}>
        <p className="type-meta text-muted-foreground">{PAST_TITLES_ONLY}</p>
      </AppShell>
    </AuthGate>
  );
}
