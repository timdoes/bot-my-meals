"use client";

import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { NeverAgainList } from "@/components/never-again-list";
import { useSupper } from "@/components/supper-provider";
import { NEVER_AGAIN_LIST_LABEL } from "@/lib/meal-dislikes";
import { canActOnBallot } from "@/lib/lock";

export default function NeverAgainPage() {
  return (
    <AuthGate>
      <NeverAgainBody />
    </AuthGate>
  );
}

function NeverAgainBody() {
  const { snapshot, session, allowMealAgain } = useSupper();

  if (!snapshot) {
    return (
      <AppShell title={NEVER_AGAIN_LIST_LABEL} backHref="/settings" backLabel="House">
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={NEVER_AGAIN_LIST_LABEL} backHref="/settings" backLabel="House">
      <NeverAgainList
        rows={snapshot.mealDislikes}
        canAct={canActOnBallot(session?.role)}
        onAllow={async (recipeKey) => {
          await allowMealAgain(recipeKey);
        }}
      />
    </AppShell>
  );
}
