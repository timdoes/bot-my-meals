"use client";

import { WHOLE_HOUSE_LABEL } from "@/lib/food-rules";
import type { HouseholdEater, Membership } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddNameInline } from "./add-name-inline";
import { ADD_A_NAME_CHIP, WHO_LABEL } from "./copy";

export type PersonSelection =
  | { kind: "house" }
  | { kind: "member"; membershipId: string }
  | { kind: "named"; eaterId: string };

export function personSelectionFromIds(
  subjectMembershipId?: string | null,
  subjectEaterId?: string | null,
): PersonSelection {
  if (subjectMembershipId) return { kind: "member", membershipId: subjectMembershipId };
  if (subjectEaterId) return { kind: "named", eaterId: subjectEaterId };
  return { kind: "house" };
}

export function personSelectionToDraft(selection: PersonSelection): {
  subjectMembershipId: string | null;
  subjectEaterId: string | null;
} {
  switch (selection.kind) {
    case "house":
      return { subjectMembershipId: null, subjectEaterId: null };
    case "member":
      return { subjectMembershipId: selection.membershipId, subjectEaterId: null };
    case "named":
      return { subjectMembershipId: null, subjectEaterId: selection.eaterId };
    default: {
      const _exhaustive: never = selection;
      return _exhaustive;
    }
  }
}

export function PersonChips({
  memberships,
  eaters,
  selected,
  onSelect,
  onAddName,
  disabled = false,
  houseLabel = WHOLE_HOUSE_LABEL,
  addNameLabel = ADD_A_NAME_CHIP,
  showHouseChip = true,
  label = WHO_LABEL,
}: {
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  selected: PersonSelection;
  onSelect: (next: PersonSelection) => void;
  onAddName?: (name: string) => void | Promise<void>;
  disabled?: boolean;
  houseLabel?: string;
  addNameLabel?: string;
  showHouseChip?: boolean;
  label?: string;
}) {
  const chipClass = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
    );

  return (
    <div data-slot="person-chips" className="space-y-2">
      <p className="type-meta text-muted-foreground">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {showHouseChip ? (
          <button
            type="button"
            role="radio"
            aria-checked={selected.kind === "house"}
            disabled={disabled}
            data-slot="person-chip"
            data-person="house"
            className={chipClass(selected.kind === "house")}
            onClick={() => onSelect({ kind: "house" })}
          >
            {houseLabel}
          </button>
        ) : null}
        {memberships.map((member) => {
          const active = selected.kind === "member" && selected.membershipId === member.id;
          return (
            <button
              key={member.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              data-slot="person-chip"
              data-person={`member:${member.id}`}
              className={chipClass(active)}
              onClick={() => onSelect({ kind: "member", membershipId: member.id })}
            >
              {member.displayName}
            </button>
          );
        })}
        {eaters.map((eater) => {
          const active = selected.kind === "named" && selected.eaterId === eater.id;
          return (
            <button
              key={eater.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              data-slot="person-chip"
              data-person={`named:${eater.id}`}
              className={chipClass(active)}
              onClick={() => onSelect({ kind: "named", eaterId: eater.id })}
            >
              {eater.displayName}
            </button>
          );
        })}
        {onAddName && !disabled ? (
          <AddNameInline
            existing={eaters}
            onAdd={async (name) => {
              await onAddName(name);
            }}
            chipLabel={addNameLabel}
          />
        ) : null}
      </div>
    </div>
  );
}
