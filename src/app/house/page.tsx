"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { HouseCard } from "@/components/house-card";
import { HouseStores } from "@/components/house-stores";
import { InviteShare } from "@/components/invite-share";
import { ManagePeople } from "@/components/manage-people";
import { PeoplePerNight } from "@/components/people-per-night";
import { useSupper } from "@/components/supper-provider";
import { WeeklyBudgetField } from "@/components/weekly-budget-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  formatWeeklyBudgetDollars,
  parseWeeklyBudgetDollars,
  shouldShowHouseSetup,
  weeklyBudgetCurrencyPrefix,
} from "@/lib/house-setup";
import { foodRulesHouseRowLine, isFoodRulesAvailable } from "@/components/food-rules";
import { HOUSE_PEOPLE_DEFAULTS_NOTE } from "@/lib/edit-nights";
import { FOOD_RULES_TITLE } from "@/lib/food-rules";
import { NEVER_AGAIN_LIST_LABEL, neverAgainMeals } from "@/lib/meal-dislikes";
import { PAST_WEEKS_LABEL } from "@/lib/meal-history";
import { FAVORITES_LABEL } from "@/lib/saved-meals";
import { isAdmin } from "@/lib/users";
import { formatWeekRange } from "@/lib/dates";
import { HOUSE_EYEBROW, HOUSE_SECTION_FOOD, HOUSE_SECTION_PEOPLE, HOUSE_SECTION_SHOPPING, favoritesRowLine, pastWeeksRowLine } from "@/lib/house-settings";

export default function HousePage() {
  return (
    <AuthGate>
      <HouseBody />
    </AuthGate>
  );
}

function HouseBody() {
  const {
    snapshot,
    session,
    updateHousehold,
    addStore,
    removeStore,
    createJoinToken,
  } = useSupper();
  const owner = isAdmin(session?.role);
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const triedJoinToken = useRef(false);
  const budget =
    budgetDraft ?? formatWeeklyBudgetDollars(snapshot?.household.weeklyBudgetCents);

  useEffect(() => {
    if (triedJoinToken.current || !owner || !snapshot || snapshot.joinToken) return;
    triedJoinToken.current = true;
    void createJoinToken(false);
  }, [createJoinToken, owner, snapshot]);

  if (!snapshot) {
    return (
      <AppShell title="House" eyebrow={HOUSE_EYEBROW}>
        <p className="type-body text-muted-foreground">Create or join a household first.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={snapshot.household.name} eyebrow={HOUSE_EYEBROW}>
      {shouldShowHouseSetup(session?.role, snapshot.household.setupStep) ? (
        <HouseCard className="mt-2">
          <h2 className="type-section text-primary">Finish setup</h2>
          <p className="type-meta mt-1 text-muted-foreground">
            Invite, household size, nights, stores, budget, then create meals. Your place is saved.
          </p>
          <Button asChild size="fat" variant="primary" className="mt-3 w-full">
            <Link href="/week?setup=1">Finish house setup</Link>
          </Button>
        </HouseCard>
      ) : null}

      <h2 data-slot="house-section" data-section="food" className="type-eyebrow mt-8 text-muted-foreground">
        {HOUSE_SECTION_FOOD}
      </h2>
      <div className="mt-3 space-y-3">
        {isFoodRulesAvailable() ? (
          <Link
            href="/house/food-rules"
            data-slot="food-rules-house-row"
            className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
          >
            <span className="min-w-0">
              <span className="type-section block text-primary">{FOOD_RULES_TITLE}</span>
              <span className="type-meta mt-0.5 block text-muted-foreground">
                {foodRulesHouseRowLine(
                  snapshot.foodRules,
                  snapshot.household.foodRulesReviewedAt,
                  neverAgainMeals(snapshot.mealDislikes).length,
                )}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          <Link
            href="/house/never-again"
            data-slot="never-again-house-row"
            className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
          >
            <span className="type-section text-primary">{NEVER_AGAIN_LIST_LABEL}</span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        )}
        <Link
          href="/house/favorites"
          data-slot="favorites-row"
          className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
        >
          <span className="min-w-0">
            <span className="type-section block text-primary">{FAVORITES_LABEL}</span>
            {favoritesRowLine(snapshot.savedMeals.length) ? (
              <span className="type-meta mt-0.5 block text-muted-foreground">
                {favoritesRowLine(snapshot.savedMeals.length)}
              </span>
            ) : null}
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Link
          href="/house/past-weeks"
          data-slot="past-weeks-row"
          className="flex min-h-12 items-center justify-between gap-3 rounded-[14px] bg-card px-5 py-3 shadow-card"
        >
          <span className="min-w-0">
            <span className="type-section block text-primary">{PAST_WEEKS_LABEL}</span>
            {pastWeeksRowLine(snapshot.mealHistory[0]?.startsOn ?? null, formatWeekRange) ? (
              <span className="type-meta mt-0.5 block text-muted-foreground">
                {pastWeeksRowLine(snapshot.mealHistory[0]?.startsOn ?? null, formatWeekRange)}
              </span>
            ) : null}
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      </div>

      <h2 data-slot="house-section" data-section="people" className="type-eyebrow mt-8 text-muted-foreground">
        {HOUSE_SECTION_PEOPLE}
      </h2>
      <ManagePeople />

      <HouseCard className="mt-6">
        <h2 className="type-section text-primary">Invite</h2>
        <p className="type-meta mt-1 text-muted-foreground">
          Share the link. They open it in their browser and join this house — Bot My Meals does not
          email anyone from here.
        </p>
        {owner ? (
          <InviteShare
            token={snapshot.joinToken ?? null}
            onRotate={() => createJoinToken(true).then(() => undefined)}
          />
        ) : (
          <p className="type-meta mt-3 text-muted-foreground">Ask an Admin to share the invite link.</p>
        )}
      </HouseCard>

      <PeoplePerNight
        household={snapshot.household}
        canEdit={owner}
        note={HOUSE_PEOPLE_DEFAULTS_NOTE}
        onChange={(patch) => void updateHousehold(patch)}
      />

      <h2 data-slot="house-section" data-section="shopping" className="type-eyebrow mt-8 text-muted-foreground">
        {HOUSE_SECTION_SHOPPING}
      </h2>
      <HouseStores
        stores={snapshot.stores}
        canEdit={owner}
        postalCode={snapshot.household.postalCode}
        onPostalCode={(code) => void updateHousehold({ postalCode: code || null })}
        onAdd={(slug, name) => void addStore(slug, name)}
        onRemove={(id) => void removeStore(id)}
      />

      <HouseCard className="mt-6">
        <h2 className="type-section text-primary">Weekly meal budget</h2>
        <p className="type-meta mt-1 text-muted-foreground">
          A target for dinners this week. We never invent grocery prices.
        </p>
        {owner ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              setBudgetError(null);
              let weeklyBudgetCents: number | null;
              try {
                weeklyBudgetCents = parseWeeklyBudgetDollars(budget);
              } catch (err) {
                setBudgetError(err instanceof Error ? err.message : "Could not save that budget.");
                return;
              }
              setBudgetBusy(true);
              void updateHousehold({ weeklyBudgetCents })
                .then(() => setBudgetDraft(null))
                .catch((err: unknown) => {
                  setBudgetError(err instanceof Error ? err.message : "Could not save that budget.");
                })
                .finally(() => setBudgetBusy(false));
            }}
          >
            <Label htmlFor="house-weekly-budget">Weekly meal budget</Label>
            <WeeklyBudgetField
              id="house-weekly-budget"
              value={budget}
              postalCode={snapshot.household.postalCode}
              onChange={setBudgetDraft}
            />
            <Button size="fat" className="w-full" disabled={budgetBusy} aria-busy={budgetBusy}>
              {budgetBusy ? "Saving…" : "Save budget"}
            </Button>
            {budgetError ? <p className="type-meta text-destructive">{budgetError}</p> : null}
          </form>
        ) : (
          <p className="type-body mt-3">
            {snapshot.household.weeklyBudgetCents == null
              ? "No weekly target set."
              : `${weeklyBudgetCurrencyPrefix(snapshot.household.postalCode)}${formatWeeklyBudgetDollars(
                  snapshot.household.weeklyBudgetCents,
                )}`}
          </p>
        )}
      </HouseCard>

      <p className="type-meta mt-8 text-center text-muted-foreground">
        Household-scoped by design. Other families cannot see this table.
      </p>
    </AppShell>
  );
}
