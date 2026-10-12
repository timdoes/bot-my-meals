"use client";

import { Suspense, useCallback, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BallotToast } from "@/components/ballot-toast";
import { ListShareButton, ListShareSheet } from "@/components/list-share";
import { ListWeekStrip } from "@/components/list-week-strip";
import { PastWeekDetail } from "@/components/past-weeks";
import { useForegroundWeekRefresh } from "@/components/use-foreground-week-refresh";
import { useWeekUrlSync } from "@/components/use-week-url-sync";
import { AuthGate } from "@/components/auth-gate";
import { ListRow } from "@/components/list-row";
import { LockFirstEmpty } from "@/components/lock-first-empty";
import { PostLockWaitingCard } from "@/components/post-lock-waiting";
import { useSupper } from "@/components/supper-provider";
import { useViewedWeek } from "@/components/use-viewed-week";
import { Button } from "@/components/ui/button";
import { useOptimisticValue } from "@/components/use-optimistic-value";
import { formatWeekEyebrow, formatWeekRange } from "@/lib/dates";
import { botCheckForSnapshot } from "@/lib/bot-check";
import { viewedWeekDataSignature } from "@/lib/foreground-week-refresh";
import { LIST_PAST_COPY, listBannerLine, listEyebrow, pastListEyebrow, type ShareGroup } from "@/lib/list-share";
import { shoppingListTitle, weekHomeTitle } from "@/lib/open-weeks";
import { steppableNights } from "@/lib/recipe-nav";
import { isNightOff } from "@/lib/lock";
import {
  DISMISS_SHOPPING_LABEL,
  DONE_SHOPPING_LABEL,
  LIST_NO_HOUSEHOLD,
  LIST_NOTHING_TO_BUY,
  LIST_PRE_LOCK_DESCRIPTION,
  LOCK_FIRST_TITLE,
} from "@/lib/lock-success";
import { isPendingBotFill } from "@/lib/post-lock-waiting";
import { recipeNightsForWeek } from "@/lib/recipes";
import {
  FOOD_RULE_CHECK_LINE,
  shoppingItemCheckTone,
  weekShowsAllergenCheckLine,
} from "@/lib/food-rule-check";
import { groupStickyStoreLists, listItemDisplay } from "@/lib/shopping";

export default function ListPage() {
  return (
    <AuthGate>
      <Suspense>
        <ListBody />
      </Suspense>
    </AuthGate>
  );
}

function ListBody() {
  const { snapshot, toggleItem, closeShoppingPrompt } = useSupper();
  const { role, scope, past } = useViewedWeek();
  const [pendingClose, setPendingClose] = useState<"done" | "dismissed" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState<string | undefined>();
  const dismissToast = useCallback(() => setToast(undefined), []);
  useWeekUrlSync("/list");
  // Foreground refresh follows the viewed (non-past) week on List too. No wake, no processing mark here.
  const foregroundSignature = scope && !past ? viewedWeekDataSignature(scope) : "";
  useForegroundWeekRefresh({
    weekId: snapshot && scope && !past ? scope.week.id : null,
    waiting:
      snapshot && scope && !past
        ? botCheckForSnapshot({
            household: snapshot.household,
            meals: scope.meals,
            votes: scope.votes,
            memberships: snapshot.memberships,
            ballotRequest: scope.ballotRequest,
            week: scope.week,
            recipes: scope.recipes,
            shoppingList: scope.shoppingList,
          }).needs_work
        : false,
    signature: foregroundSignature,
  });
  const strip: ReactNode = <ListWeekStrip />;
  if (!snapshot) {
    return (
      <AppShell title="Shopping list">
        <p className="type-body text-muted-foreground">{LIST_NO_HOUSEHOLD}</p>
      </AppShell>
    );
  }

  if (past) {
    return (
      <AppShell title="Shopping list" eyebrow={pastListEyebrow(formatWeekRange(past.startsOn))} eyebrowMuted chrome={strip}>
        <p data-slot="past-week-list" className="type-body mb-4 text-muted-foreground">
          {LIST_PAST_COPY}
        </p>
        <PastWeekDetail week={past} />
      </AppShell>
    );
  }

  if (!scope) {
    return (
      <AppShell title="Shopping list">
        <p className="type-body text-muted-foreground">{LIST_NO_HOUSEHOLD}</p>
      </AppShell>
    );
  }

  const locked = scope.week.status === "locked";
  const listTitle = shoppingListTitle();
  const eyebrow = listEyebrow(weekHomeTitle(role), formatWeekEyebrow(scope.week.startsOn, locked));
  const pendingFill = isPendingBotFill({
    weekStatus: scope.week.status,
    meals: scope.meals,
    votes: scope.votes,
    memberships: snapshot.memberships,
    recipes: scope.recipes,
    shoppingList: scope.shoppingList,
  });
  const nights = recipeNightsForWeek(scope.meals);
  const removedMealIds = new Set(
    nights.filter((meal) => isNightOff(meal.id, scope.votes)).map((meal) => meal.id),
  );

  if (!locked) {
    return (
      <AppShell title={listTitle} eyebrow={eyebrow} chrome={strip}>
        <LockFirstEmpty
          title={LOCK_FIRST_TITLE}
          description={LIST_PRE_LOCK_DESCRIPTION}
          meals={nights}
          removedMealIds={removedMealIds}
        />
      </AppShell>
    );
  }

  const list = scope.shoppingList;
  if (pendingFill && (!list || list.items.length === 0)) {
    return (
      <AppShell title={listTitle} eyebrow={eyebrow} chrome={strip}>
        <PostLockWaitingCard weekRole={role} startsOn={scope.week.startsOn} />
      </AppShell>
    );
  }

  if (!list || list.items.length === 0) {
    return (
      <AppShell title={listTitle} eyebrow={eyebrow} chrome={strip}>
        <div className="rounded-[14px] border border-dashed border-border bg-card p-5 shadow-card">
          <h2 className="type-section">Nothing to buy</h2>
          <p className="type-body mt-2 text-muted-foreground">{LIST_NOTHING_TO_BUY}</p>
        </div>
      </AppShell>
    );
  }

  const groups = groupStickyStoreLists(list.items, snapshot.stores);
  const showAllergenLine = weekShowsAllergenCheckLine(snapshot, scope.week.id);
  const shareGroups: ShareGroup[] = groups.map((group) => ({
    store: group.label,
    items: group.items.map((item) => ({ ...listItemDisplay(item), checked: item.checked })),
  }));
  const checkedCount = list.items.filter((item) => item.checked).length;
  const dinners = steppableNights(scope.meals, scope.votes, snapshot.memberships).length;

  return (
    <AppShell
      title={listTitle}
      eyebrow={eyebrow}
      chrome={strip}
      titleAction={<ListShareButton onOpen={() => setShareOpen(true)} />}
    >
      <p
        data-slot="list-banner"
        className="type-meta mb-4 rounded-[12px] bg-primary/10 px-4 py-2.5 text-primary"
      >
        {listBannerLine(checkedCount, list.items.length, dinners)}
      </p>
      {showAllergenLine ? (
        <p data-slot="food-rule-check-line" className="type-meta mb-4 text-muted-foreground">
          {FOOD_RULE_CHECK_LINE}
        </p>
      ) : null}
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.store.id} data-slot="list-store-section">
            <h2
              data-slot="list-store"
              data-store={group.store.slug}
              className="type-eyebrow sticky z-10 -mx-4 bg-card/95 px-4 py-2 text-primary shadow-card backdrop-blur-md"
              style={{ top: "var(--shell-head-h, 5.5rem)" }}
            >
              {group.label}
            </h2>
            <ul className="divide-y divide-border">
              {group.items.map((item) => {
                const display = listItemDisplay(item);
                return (
                  <ShoppingListRow
                    key={item.id}
                    itemId={item.id}
                    name={display.name}
                    quantity={display.quantity}
                    checked={item.checked}
                    checkLabel={shoppingItemCheckTone(snapshot, scope.week.id, display.name)}
                    onToggle={toggleItem}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {scope.week.shoppingPrompt === "open" || pendingClose ? (
        <div data-slot="shopping-prompt-actions" className="mt-8 space-y-2">
          <Button
            type="button"
            size="fat"
            variant="primary"
            className="w-full"
            data-slot="done-shopping"
            disabled={pendingClose !== null}
            aria-busy={pendingClose === "done"}
            onClick={() => {
              setPendingClose("done");
              void closeShoppingPrompt("done")
                .catch(() => undefined)
                .finally(() => setPendingClose(null));
            }}
          >
            {pendingClose === "done" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {pendingClose === "done" ? "Saving…" : DONE_SHOPPING_LABEL}
          </Button>
          <Button
            type="button"
            size="fat"
            variant="ghost"
            className="w-full"
            data-slot="dismiss-shopping"
            disabled={pendingClose !== null}
            aria-busy={pendingClose === "dismissed"}
            onClick={() => {
              setPendingClose("dismissed");
              void closeShoppingPrompt("dismissed")
                .catch(() => undefined)
                .finally(() => setPendingClose(null));
            }}
          >
            {pendingClose === "dismissed" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
            {DISMISS_SHOPPING_LABEL}
          </Button>
        </div>
      ) : null}
      <ListShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        range={formatWeekRange(scope.week.startsOn)}
        startsOn={scope.week.startsOn}
        groups={shareGroups}
        onToast={setToast}
      />
      <BallotToast message={toast} onDismiss={dismissToast} />
    </AppShell>
  );
}

function ShoppingListRow({
  itemId,
  name,
  quantity,
  checked,
  checkLabel,
  onToggle,
}: {
  itemId: string;
  name: string;
  quantity: string;
  checked: boolean;
  checkLabel?: "allergy" | "intolerance" | null;
  onToggle: (itemId: string, checked: boolean) => Promise<void>;
}) {
  const optimistic = useOptimisticValue(checked, (next) => onToggle(itemId, next));
  return (
    <ListRow
      name={name}
      quantity={quantity}
      checked={optimistic.value}
      checkLabel={checkLabel}
      onCheckedChange={optimistic.commit}
    />
  );
}
