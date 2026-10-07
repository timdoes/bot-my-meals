"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  FAVORITE_CANCEL_LABEL,
  FAVORITE_IN_THREE_WEEKS,
  FAVORITE_NEXT_WEEK,
  FAVORITE_NOTE_LABEL,
  FAVORITE_SEND_LABEL,
  FAVORITE_SWITCH_LABEL,
  favoriteSendAction,
  type FavoriteAction,
  type FavoriteDraft,
  type FavoriteTiming,
} from "@/lib/saved-meals";
import { cn } from "@/lib/utils";

export function FavoriteMealForm({
  favorite,
  timing,
  note,
  wasFavorite,
  onFavorite,
  onTiming,
  onNote,
  onSend,
  onCancel,
}: {
  favorite: boolean;
  timing: FavoriteTiming;
  note: string;
  wasFavorite: boolean;
  onFavorite: (next: boolean) => void;
  onTiming: (timing: FavoriteTiming) => void;
  onNote: (note: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const sendEnabled = favoriteSendAction({ favorite, timing, note }, wasFavorite) !== null;
  return (
    <form
      data-slot="favorite-meal-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sendEnabled) return;
        onSend();
      }}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor="favorite-switch" className="text-sm font-semibold">
          {FAVORITE_SWITCH_LABEL}
        </Label>
        <Switch id="favorite-switch" checked={favorite} onCheckedChange={onFavorite} />
      </div>
      {favorite ? (
        <div
          role="radiogroup"
          aria-label="When to suggest this favorite"
          data-slot="favorite-timing-choice"
          className="grid gap-2"
        >
          <TimingChoice
            timing="next"
            label={FAVORITE_NEXT_WEEK}
            selected={timing === "next"}
            onSelect={onTiming}
          />
          <TimingChoice
            timing="cooldown"
            label={FAVORITE_IN_THREE_WEEKS}
            selected={timing === "cooldown"}
            onSelect={onTiming}
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="favorite-note">{FAVORITE_NOTE_LABEL}</Label>
        <Textarea
          id="favorite-note"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          className="min-h-24 rounded-2xl text-base"
        />
      </div>
      <DialogFooter className="sm:flex-col">
        <Button type="submit" size="fat" variant="primary" className="w-full" disabled={!sendEnabled}>
          {FAVORITE_SEND_LABEL}
        </Button>
        <Button type="button" size="fat" variant="outline" className="w-full" onClick={onCancel}>
          {FAVORITE_CANCEL_LABEL}
        </Button>
      </DialogFooter>
    </form>
  );
}

function TimingChoice({
  timing,
  label,
  selected,
  onSelect,
}: {
  timing: FavoriteTiming;
  label: string;
  selected: boolean;
  onSelect: (timing: FavoriteTiming) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-timing={timing}
      onClick={() => onSelect(timing)}
      className={cn(
        "tap-target inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-button)] border px-3 text-sm font-semibold",
        selected ? "border-transparent bg-secondary text-foreground" : "border-border bg-card text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function FavoriteMealControl({
  visible,
  favorite,
  timing,
  onSend,
}: {
  visible: boolean;
  favorite: boolean;
  timing: FavoriteTiming;
  onSend: (draft: FavoriteDraft) => Promise<FavoriteAction | void>;
}) {
  const [open, setOpen] = useState(false);
  const [favoriteOn, setFavoriteOn] = useState(true);
  const [choice, setChoice] = useState<FavoriteTiming>("cooldown");
  const [note, setNote] = useState("");

  if (!visible) return null;

  const openModal = () => {
    setFavoriteOn(true);
    setChoice(favorite ? timing : "cooldown");
    setNote("");
    setOpen(true);
  };

  const send = () => {
    const draft: FavoriteDraft = { favorite: favoriteOn, timing: choice, note };
    if (!favoriteSendAction(draft, favorite)) return;
    setOpen(false);
    void onSend(draft).catch(() => undefined);
  };

  return (
    <>
      <button
        type="button"
        data-slot="favorite-meal"
        aria-label={FAVORITE_SWITCH_LABEL}
        onClick={openModal}
        className="tap-target inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card text-foreground"
      >
        <ThumbsUp aria-hidden className={cn("size-5", favorite && "fill-current")} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-[14px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">{FAVORITE_SWITCH_LABEL}</DialogTitle>
          </DialogHeader>
          <FavoriteMealForm
            favorite={favoriteOn}
            timing={choice}
            note={note}
            wasFavorite={favorite}
            onFavorite={setFavoriteOn}
            onTiming={setChoice}
            onNote={setNote}
            onSend={send}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
