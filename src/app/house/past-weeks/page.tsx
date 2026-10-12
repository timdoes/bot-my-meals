"use client";

import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { PastWeeksList } from "@/components/past-weeks";
import { useSupper } from "@/components/supper-provider";
import { PAST_WEEKS_HELPER, PAST_WEEKS_LABEL } from "@/lib/meal-history";

export default function PastWeeksPage() {
  return (
    <AuthGate>
      <PastWeeksBody />
    </AuthGate>
  );
}

function PastWeeksBody() {
  const { snapshot } = useSupper();
  if (!snapshot) {
    return (
      <AppShell title={PAST_WEEKS_LABEL} backHref="/house" backLabel="House">
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={PAST_WEEKS_LABEL} backHref="/house" backLabel="House">
      <p data-slot="past-weeks-helper" className="type-meta mb-4 text-muted-foreground">
        {PAST_WEEKS_HELPER}
      </p>
      <PastWeeksList weeks={snapshot.mealHistory} />
    </AppShell>
  );
}
