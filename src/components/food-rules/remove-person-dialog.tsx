"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LAST_ATTENDEE_ERROR, removePersonTitle } from "@/lib/food-rules";
import {
  keepPersonLabel,
  removePersonAction,
  removePersonNightsLine,
  removePersonRulesLine,
  removePersonUndoLine,
} from "./copy";

export function RemovePersonBody({
  name,
  foods,
  lastAttendee = false,
  onKeep,
  onRemove,
}: {
  name: string;
  foods: readonly string[];
  lastAttendee?: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const rulesLine = removePersonRulesLine(foods);

  return (
    <div data-slot="remove-person-dialog">
      <h2 className="type-section">{removePersonTitle(name)}</h2>
      <div className="mt-3 space-y-3 text-foreground">
        {rulesLine ? <p className="type-body">{rulesLine}</p> : null}
        <p className="type-body">{removePersonNightsLine(name)}</p>
        <p className="type-meta text-muted-foreground">{removePersonUndoLine(name)}</p>
        {lastAttendee ? (
          <p data-slot="last-attendee-error" className="type-body text-destructive">
            {LAST_ATTENDEE_ERROR}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" size="fat" variant="outline" onClick={onKeep}>
          {keepPersonLabel(name)}
        </Button>
        <Button type="button" size="fat" variant="destructive" disabled={lastAttendee} onClick={onRemove}>
          {removePersonAction(name)}
        </Button>
      </div>
    </div>
  );
}

export function RemovePersonDialog({
  open,
  name,
  foods,
  lastAttendee = false,
  onKeep,
  onRemove,
}: {
  open: boolean;
  name: string;
  foods: readonly string[];
  lastAttendee?: boolean;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onKeep() : undefined)}>
      <DialogContent
        data-slot="remove-person-dialog"
        showCloseButton={false}
        className="rounded-[20px] p-5"
      >
        <DialogHeader>
          <DialogTitle className="type-section">{removePersonTitle(name)}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-foreground">
              {removePersonRulesLine(foods) ? (
                <p className="type-body">{removePersonRulesLine(foods)}</p>
              ) : null}
              <p className="type-body">{removePersonNightsLine(name)}</p>
              <p className="type-meta text-muted-foreground">{removePersonUndoLine(name)}</p>
              {lastAttendee ? (
                <p data-slot="last-attendee-error" className="type-body text-destructive">
                  {LAST_ATTENDEE_ERROR}
                </p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <Button type="button" size="fat" variant="outline" onClick={onKeep}>
            {keepPersonLabel(name)}
          </Button>
          <Button
            type="button"
            size="fat"
            variant="destructive"
            disabled={lastAttendee}
            onClick={onRemove}
          >
            {removePersonAction(name)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
