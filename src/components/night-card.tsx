import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { WEEKDAY_LABELS } from "@/lib/dates";
import { formatNightDate } from "@/lib/dates";
import { servingsLabel } from "@/lib/headcount";
import { voteConfirmation } from "@/lib/ballot";
import {
  FOOD_RULE_NEEDS_CHANGE,
  cardFoodRuleHits,
  foodRuleChipLabel,
} from "@/lib/food-rule-check";
import { isNightOff, voteFor } from "@/lib/lock";
import type { HouseholdSnapshot, Meal } from "@/lib/types";
import { VoteDots } from "@/components/vote-pills";
import { Badge } from "@/components/ui/badge";

export function NightCard({
  meal,
  snapshot,
  membershipId,
}: {
  meal: Meal;
  snapshot: HouseholdSnapshot;
  membershipId: string | null;
}) {
  const mine = membershipId ? voteFor(snapshot.votes, meal.id, membershipId) : undefined;
  const skipped = isNightOff(meal.id, snapshot.votes);
  const weekday = WEEKDAY_LABELS[new Date(`${meal.nightDate}T12:00:00`).getDay()];
  const cardHits = skipped ? { allergy: null, intolerance: null } : cardFoodRuleHits(snapshot, meal);
  const conflict = cardHits.allergy ?? cardHits.intolerance;

  return (
    <Link
      href={`/week/${meal.id}`}
      className="block rounded-3xl border border-border bg-card p-4 shadow-sm active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {weekday} · {formatNightDate(meal.nightDate)}
          </p>
          <h2 className="font-heading mt-1 text-xl leading-tight">
            {skipped ? "No dinner" : meal.title}
          </h2>
          {conflict ? (
            <p
              data-slot="food-rule-chip"
              data-severity={conflict.severity}
              className={`type-chip mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                conflict.severity === "allergy"
                  ? "border-destructive/40 text-destructive"
                  : "border-[color:var(--swap)]/40 text-swap"
              }`}
            >
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              {foodRuleChipLabel(conflict)}
            </p>
          ) : null}
          {cardHits.allergy &&
          (meal.weekId === snapshot.week.id ? snapshot.week.status : snapshot.planning?.week.status) !==
            "locked" ? (
            <p data-slot="food-rule-needs-change" className="type-body mt-2 text-muted-foreground">
              {FOOD_RULE_NEEDS_CHANGE}.
            </p>
          ) : null}
        </div>
        <VoteDots memberships={snapshot.memberships} votes={snapshot.votes} mealId={meal.id} />
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {skipped ? "Removed — empty night. Nothing from this night goes on the list." : meal.pitch}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{servingsLabel(meal.servings)}</Badge>
        <Badge variant="outline">{meal.prepMinutes} min</Badge>
        {meal.isLeftovers ? <Badge variant="outline">Leftovers</Badge> : null}
        {mine ? (
          <Badge>{voteConfirmation(mine.choice)}</Badge>
        ) : (
          <Badge variant="outline">Passive</Badge>
        )}
      </div>
    </Link>
  );
}
