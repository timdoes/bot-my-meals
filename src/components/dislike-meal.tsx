"use client";

import { useState } from "react";
import { ThumbsDown } from "lucide-react";
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
  DISLIKE_BUTTON_LABEL,
  DISLIKE_CANCEL_LABEL,
  DISLIKE_NOTE_LABEL,
  DISLIKE_NOTE_PLACEHOLDER,
  DISLIKE_SEND_LABEL,
  DISLIKE_TITLE,
  NEVER_AGAIN_LABEL,
  dislikeSendAction,
  type DislikeAction,
  type DislikeDraft,
} from "@/lib/meal-dislikes";
import { cn } from "@/lib/utils";

export function DislikeMealForm({
  neverAgain,
  note,
  currentlyBlocked,
  onNeverAgain,
  onNote,
  onSend,
  onCancel,
}: {
  neverAgain: boolean;
  note: string;
  currentlyBlocked: boolean;
  onNeverAgain: (next: boolean) => void;
  onNote: (note: string) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const sendEnabled = dislikeSendAction({ neverAgain, note }, currentlyBlocked) !== null;
  return (
    <form
      data-slot="dislike-meal-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!sendEnabled) return;
        onSend();
      }}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Label htmlFor="never-again-switch" className="text-sm font-semibold">
          {NEVER_AGAIN_LABEL}
        </Label>
        <Switch id="never-again-switch" checked={neverAgain} onCheckedChange={onNeverAgain} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dislike-note">{DISLIKE_NOTE_LABEL}</Label>
        <Textarea
          id="dislike-note"
          value={note}
          placeholder={DISLIKE_NOTE_PLACEHOLDER}
          onChange={(event) => onNote(event.target.value)}
          className="min-h-24 rounded-2xl text-base"
        />
      </div>
      <DialogFooter className="sm:flex-col">
        <Button type="submit" size="fat" variant="primary" className="w-full" disabled={!sendEnabled}>
          {DISLIKE_SEND_LABEL}
        </Button>
        <Button type="button" size="fat" variant="outline" className="w-full" onClick={onCancel}>
          {DISLIKE_CANCEL_LABEL}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DislikeMealControl({
  visible,
  blocked,
  note,
  onSend,
}: {
  visible: boolean;
  blocked: boolean;
  note: string;
  onSend: (draft: DislikeDraft) => Promise<DislikeAction | void>;
}) {
  const [open, setOpen] = useState(false);
  const [neverAgain, setNeverAgain] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  if (!visible) return null;

  const openModal = () => {
    setNeverAgain(blocked);
    setDraftNote(blocked ? note : "");
    setOpen(true);
  };

  const send = () => {
    const draft: DislikeDraft = { neverAgain, note: draftNote };
    if (!dislikeSendAction(draft, blocked)) return;
    setOpen(false);
    void onSend(draft).catch(() => undefined);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        data-slot="dislike-meal"
        aria-label={DISLIKE_BUTTON_LABEL}
        onClick={openModal}
        className="tap-target inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card text-foreground"
      >
        <ThumbsDown aria-hidden className={cn("size-5", blocked && "fill-current")} />
      </button>
      {blocked ? (
        <span data-slot="never-again-chip" className="type-chip text-muted-foreground">
          {NEVER_AGAIN_LABEL}
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-[14px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="type-section">{DISLIKE_TITLE}</DialogTitle>
          </DialogHeader>
          <DislikeMealForm
            neverAgain={neverAgain}
            note={draftNote}
            currentlyBlocked={blocked}
            onNeverAgain={setNeverAgain}
            onNote={setDraftNote}
            onSend={send}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </span>
  );
}
