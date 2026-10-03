"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, CircleMinus, GripVertical, RefreshCw } from "lucide-react";
import {
  REMOVE_CONFIRM_ACTION,
  REMOVE_CONFIRM_KEEP,
  REMOVE_CONFIRM_TITLE,
  SWAP_REQUESTED,
  SWAP_SHEET_CANCEL,
  SWAP_SHEET_HELPER,
  SWAP_SHEET_PLACEHOLDER,
  SWAP_SHEET_REASON_LABEL,
  SWAP_SHEET_SEND,
  SWAP_SHEET_TITLE,
  removeDinnerBody,
  voteActionLabel,
} from "@/lib/ballot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { mealCardControlId } from "@/lib/dates";
import { MOVE_EARLIER_LABEL, MOVE_LATER_LABEL, reorderGripLabel } from "@/lib/meal-reorder";
import { cn } from "@/lib/utils";

const REORDER_HIT =
  "inline-flex size-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-button)] outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type MealReorderHandlers = {
  mealId: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  busy: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onDrop: (targetMealId: string) => void;
};

function reorderTargetAtPoint(x: number, y: number, sourceId: string): string | null {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    const card = node.closest("[data-reorder-id]");
    if (!card) continue;
    const id = card.getAttribute("data-reorder-id");
    if (!id || id === sourceId) continue;
    if (card.getAttribute("data-reorderable") !== "true") continue;
    return id;
  }
  return null;
}

function markReorderDrop(targetId: string | null) {
  for (const node of document.querySelectorAll("[data-reorder-id]")) {
    if (targetId && node.getAttribute("data-reorder-id") === targetId) {
      node.setAttribute("data-drop", "true");
    } else {
      node.removeAttribute("data-drop");
    }
  }
}

function clearCardLift(article: HTMLElement, animate: boolean) {
  article.dataset.dragging = "false";
  article.style.zIndex = "";
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate || reduce) {
    article.style.transition = "";
    article.style.transform = "";
    return;
  }
  article.style.transition = "transform 160ms ease";
  window.requestAnimationFrame(() => {
    article.style.transform = "";
  });
}

function useMealCardDrag(
  articleRef: RefObject<HTMLElement | null>,
  reorder: MealReorderHandlers | undefined,
) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const enabled = Boolean(reorder) && !reorder?.busy;
  const sourceId = reorder?.mealId ?? "";
  const onDrop = reorder?.onDrop;

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    const article = articleRef.current;
    if (!article) return;
    article.dataset.dragging = "true";
    article.style.transition = "none";
    article.style.zIndex = "30";
    article.style.transform = "translate3d(0, 0, 0)";
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = origin.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const article = articleRef.current;
    if (article) article.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    const moved = Math.hypot(dx, dy) >= 8;
    markReorderDrop(moved ? reorderTargetAtPoint(event.clientX, event.clientY, sourceId) : null);
  };

  const finish = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const start = origin.current;
    origin.current = null;
    markReorderDrop(null);
    const article = articleRef.current;
    const dx = start ? event.clientX - start.x : 0;
    const dy = start ? event.clientY - start.y : 0;
    const target =
      commit && Math.hypot(dx, dy) >= 8
        ? reorderTargetAtPoint(event.clientX, event.clientY, sourceId)
        : null;
    if (article) clearCardLift(article, !target);
    if (target) onDrop?.(target);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, true),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, false),
  };
}

export function BallotCard({
  dayLabel,
  confirmDayLabel,
  title,
  pitch,
  servings,
  swapped = false,
  swapNote,
  muted = false,
  locked = false,
  onSwap,
  onRemove,
  reorder,
  openHref,
  className,
}: {
  dayLabel: string;
  confirmDayLabel?: string;
  title: string;
  pitch?: string;
  servings?: number;
  swapped?: boolean;
  swapNote?: string;
  muted?: boolean;
  locked?: boolean;
  onSwap?: (reason: string) => void | Promise<void>;
  onRemove?: () => void | Promise<void>;
  reorder?: MealReorderHandlers;
  /** Body tap opens the meal. Omitted when a parent link already wraps the card. */
  openHref?: string;
  className?: string;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const drag = useMealCardDrag(articleRef, reorder);
  const [sheet, setSheet] = useState<"swap" | "remove" | null>(null);
  const [reason, setReason] = useState(swapNote ?? "");
  const canAct = Boolean(onSwap || onRemove) && !locked;
  const showActions = canAct || Boolean(reorder);
  const swapFieldId = mealCardControlId("swap-reason", dayLabel);

  const sendSwap = () => {
    if (!onSwap) return;
    const pending = onSwap(reason.trim());
    setSheet(null);
    void Promise.resolve(pending).catch(() => undefined);
  };

  const confirmRemove = () => {
    if (!onRemove) return;
    const pending = onRemove();
    setSheet(null);
    void Promise.resolve(pending).catch(() => undefined);
  };

  const body = (
    <>
      <p
        data-slot="meal-day-label"
        className={cn(
          "type-day-label",
          muted ? "text-secondary-foreground/70" : "text-muted-foreground",
        )}
      >
        {dayLabel}
      </p>
      <h2 className="type-section mt-1">{title}</h2>
      {pitch ? (
        <p
          className={cn(
            "type-body mt-2 line-clamp-2",
            muted ? "text-secondary-foreground/80" : "text-muted-foreground",
          )}
        >
          {pitch}
        </p>
      ) : null}
      {servings != null && servings > 0 ? (
        <p
          className={cn(
            "type-chip mt-3 inline-flex rounded-[var(--radius-chip)] px-2.5 py-1",
            muted ? "bg-background/40 text-secondary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <span className="font-mono">{servings}</span>
          <span className="ml-1">{servings === 1 ? "serving" : "servings"}</span>
        </p>
      ) : servings === 0 ? (
        <p
          className={cn(
            "type-chip mt-3 inline-flex rounded-[var(--radius-chip)] px-2.5 py-1",
            muted ? "bg-background/40 text-secondary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          No dinner
        </p>
      ) : null}
      {swapped ? (
        <div className="mt-3 space-y-1">
          <p className="type-meta text-swap">{SWAP_REQUESTED}</p>
          {swapNote ? <p className="type-body text-muted-foreground">{swapNote}</p> : null}
        </div>
      ) : null}
    </>
  );

  return (
    <article
      ref={articleRef}
      data-slot="ballot-card"
      data-swapped={swapped ? "true" : "false"}
      data-muted={muted ? "true" : "false"}
      data-reorder-id={reorder ? reorder.mealId : undefined}
      data-reorderable={reorder ? "true" : undefined}
      data-dragging="false"
      aria-busy={reorder?.busy ? true : undefined}
      className={cn(
        "relative rounded-[14px] p-4 shadow-card",
        "data-[dragging=true]:z-30 data-[dragging=true]:shadow-[0_16px_40px_rgb(0_0_0/0.22)]",
        "data-[drop=true]:bg-primary/10 data-[drop=true]:ring-2 data-[drop=true]:ring-primary",
        reorder && "flex items-start gap-1",
        muted ? "bg-secondary text-secondary-foreground" : "bg-card text-card-foreground",
        className,
      )}
    >
      {reorder ? (
        <button
          type="button"
          data-slot="meal-reorder-grip"
          className={cn(REORDER_HIT, "cursor-grab touch-none text-muted-foreground active:cursor-grabbing")}
          aria-label={reorderGripLabel(title)}
          disabled={reorder.busy}
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <GripVertical aria-hidden className="size-5" />
        </button>
      ) : null}
      <div className={cn(reorder && "min-w-0 flex-1")}>
        {openHref ? (
          <Link href={openHref} data-slot="meal-card-open" draggable={false} className="block">
            {body}
          </Link>
        ) : (
          body
        )}
      {showActions ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={`Actions for ${title}`}>
          {reorder ? (
            <>
              <button
                type="button"
                data-slot="meal-reorder-earlier"
                className={cn(REORDER_HIT, "border border-border text-foreground disabled:opacity-40")}
                aria-label={MOVE_EARLIER_LABEL}
                disabled={reorder.busy || !reorder.canMoveEarlier}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  reorder.onMoveEarlier();
                }}
              >
                <ChevronUp aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                data-slot="meal-reorder-later"
                className={cn(REORDER_HIT, "border border-border text-foreground disabled:opacity-40")}
                aria-label={MOVE_LATER_LABEL}
                disabled={reorder.busy || !reorder.canMoveLater}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  reorder.onMoveLater();
                }}
              >
                <ChevronDown aria-hidden className="size-5" />
              </button>
            </>
          ) : null}
          {onSwap ? (
            <Button
              type="button"
              size="vote"
              variant={swapped ? "swap" : "outline"}
              className="gap-2"
              aria-pressed={swapped}
              aria-label={voteActionLabel("swap", title)}
              onClick={() => {
                setReason(swapNote ?? "");
                setSheet("swap");
              }}
            >
              <RefreshCw className="size-5 shrink-0" />
              Swap
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              size="vote"
              variant="outline"
              className="gap-2"
              aria-label={voteActionLabel("remove", title)}
              onClick={() => setSheet("remove")}
            >
              <CircleMinus className="size-5 shrink-0" />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      <Sheet open={sheet === "swap"} onOpenChange={(open) => setSheet(open ? "swap" : null)}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-[16px]"
        >
          <SheetHeader>
            <SheetTitle className="type-section">{SWAP_SHEET_TITLE}</SheetTitle>
            <SheetDescription className="type-body">{SWAP_SHEET_HELPER}</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4">
            <Label htmlFor={swapFieldId} className="type-meta text-muted-foreground">
              {SWAP_SHEET_REASON_LABEL}
            </Label>
            <Textarea
              id={swapFieldId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={SWAP_SHEET_PLACEHOLDER}
              className="min-h-16 max-h-32 overflow-y-auto rounded-[var(--radius-button)] text-base"
            />
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              size="fat"
              variant="outline"
              className="flex-1"
              onClick={() => setSheet(null)}
            >
              {SWAP_SHEET_CANCEL}
            </Button>
            <Button
              type="button"
              size="fat"
              variant="primary"
              className="flex-1"
              onClick={() => sendSwap()}
            >
              {SWAP_SHEET_SEND}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={sheet === "remove"} onOpenChange={(open) => setSheet(open ? "remove" : null)}>
        <DialogContent showCloseButton={false} className="rounded-[14px]">
          <DialogHeader>
            <DialogTitle className="type-section">{REMOVE_CONFIRM_TITLE}</DialogTitle>
            <DialogDescription className="type-body">
              {removeDinnerBody(confirmDayLabel ?? dayLabel)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              size="fat"
              variant="skip"
              className="w-full"
              onClick={() => confirmRemove()}
            >
              {REMOVE_CONFIRM_ACTION}
            </Button>
            <Button
              type="button"
              size="fat"
              variant="outline"
              className="w-full"
              onClick={() => setSheet(null)}
            >
              {REMOVE_CONFIRM_KEEP}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </article>
  );
}
