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
import { KEEP_LABEL, REMOVE_ALLERGY_TITLE, REMOVE_LABEL, removeAllergyBody } from "./copy";

export function RemoveAllergyBody({
  food,
  onKeep,
  onRemove,
}: {
  food: string;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <div data-slot="remove-allergy-dialog">
      <h2 className="type-section">{REMOVE_ALLERGY_TITLE}</h2>
      <p className="type-body mt-2 text-foreground">{removeAllergyBody(food)}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" size="fat" variant="outline" onClick={onKeep}>
          {KEEP_LABEL}
        </Button>
        <Button type="button" size="fat" variant="destructive" onClick={onRemove}>
          {REMOVE_LABEL}
        </Button>
      </div>
    </div>
  );
}

export function RemoveAllergyDialog({
  open,
  food,
  onKeep,
  onRemove,
}: {
  open: boolean;
  food: string;
  onKeep: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onKeep() : undefined)}>
      <DialogContent
        data-slot="remove-allergy-dialog"
        showCloseButton={false}
        className="rounded-[20px] p-5"
      >
        <DialogHeader>
          <DialogTitle className="type-section">{REMOVE_ALLERGY_TITLE}</DialogTitle>
          <DialogDescription className="type-body text-foreground">
            {removeAllergyBody(food)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 border-0 bg-transparent p-0">
          <Button type="button" size="fat" variant="outline" onClick={onKeep}>
            {KEEP_LABEL}
          </Button>
          <Button type="button" size="fat" variant="destructive" onClick={onRemove}>
            {REMOVE_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
