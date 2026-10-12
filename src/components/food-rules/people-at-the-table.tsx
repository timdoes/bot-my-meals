"use client";

import { useState } from "react";
import { HouseCard } from "@/components/house-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EATER_NAME_MAX, PEOPLE_AT_THE_TABLE, validateEaterName } from "@/lib/food-rules";
import { memberInitials } from "@/lib/initials";
import type { FoodRule, HouseholdEater, Membership } from "@/lib/types";
import { roleLabel } from "@/lib/users";
import { AddNameInline } from "./add-name-inline";
import {
  ADD_A_NAME_CHIP,
  nameOnlyLine,
  PEOPLE_EATER_FOOTNOTE,
  PEOPLE_FOOTNOTE,
  PEOPLE_HELPER,
  REMOVE_LABEL,
  RENAME_LABEL,
  signsInLine,
  YOU_BADGE,
} from "./copy";
import { RemovePersonDialog } from "./remove-person-dialog";

export function PeopleAtTheTable({
  memberships,
  eaters,
  rules,
  sessionMembershipId,
  canAct,
  lastAttendeeEaterId,
  onAddName,
  onRename,
  onRemove,
}: {
  memberships: readonly Membership[];
  eaters: readonly HouseholdEater[];
  rules: readonly FoodRule[];
  sessionMembershipId?: string | null;
  canAct: boolean;
  lastAttendeeEaterId?: string | null;
  onAddName: (name: string) => void | Promise<void>;
  onRename: (eaterId: string, name: string) => void | Promise<void>;
  onRemove: (eaterId: string) => void | Promise<void>;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<HouseholdEater | null>(null);

  const commitRename = (eater: HouseholdEater) => {
    const invalid = validateEaterName(renameDraft, eaters, eater.id);
    if (invalid) {
      setRenameError(invalid);
      return;
    }
    void Promise.resolve(onRename(eater.id, renameDraft.trim()));
    setRenamingId(null);
    setRenameError(null);
  };

  return (
    <section data-slot="people-at-the-table" className="space-y-3">
      <div>
        <h2 className="type-section text-foreground">{PEOPLE_AT_THE_TABLE}</h2>
        <p className="type-meta mt-1 text-muted-foreground">{PEOPLE_HELPER}</p>
      </div>

      <HouseCard className="p-0">
        <ul>
          {memberships.map((member) => {
            const you = member.id === sessionMembershipId;
            return (
              <li
                key={member.id}
                data-slot="table-person"
                data-kind="member"
                className="flex min-h-16 items-center gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
                >
                  {memberInitials(member.displayName).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="type-body font-semibold">
                    {member.displayName}
                    {you ? <span className="ml-2 type-meta font-semibold text-muted-foreground">{YOU_BADGE}</span> : null}
                  </p>
                  <p className="type-meta text-muted-foreground">{signsInLine(roleLabel(member.role))}</p>
                </div>
              </li>
            );
          })}
          {eaters.map((eater) => {
            const ruleCount = rules.filter((rule) => rule.subjectEaterId === eater.id).length;
            const editing = renamingId === eater.id;
            return (
              <li
                key={eater.id}
                data-slot="table-person"
                data-kind="named"
                className="flex min-h-16 items-center gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
                >
                  {memberInitials(eater.displayName).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-1">
                      <Input
                        aria-label={RENAME_LABEL}
                        value={renameDraft}
                        maxLength={EATER_NAME_MAX}
                        autoFocus
                        onChange={(event) => {
                          setRenameDraft(event.target.value);
                          setRenameError(null);
                        }}
                        onBlur={() => commitRename(eater)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRename(eater);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setRenamingId(null);
                            setRenameError(null);
                          }
                        }}
                        className="h-11 min-h-11 rounded-[14px] px-3"
                      />
                      {renameError ? <p className="type-meta text-destructive">{renameError}</p> : null}
                    </div>
                  ) : (
                    <>
                      <p className="type-body font-semibold">{eater.displayName}</p>
                      <p className="type-meta text-muted-foreground">{nameOnlyLine(ruleCount)}</p>
                    </>
                  )}
                </div>
                {canAct && !editing ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="link"
                      className="h-11 min-h-11 px-2 font-semibold"
                      onClick={() => {
                        setRenamingId(eater.id);
                        setRenameDraft(eater.displayName);
                        setRenameError(null);
                      }}
                    >
                      {RENAME_LABEL}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="h-11 min-h-11 px-2 font-semibold text-destructive"
                      onClick={() => setRemoving(eater)}
                    >
                      {REMOVE_LABEL}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canAct ? (
          <div className="border-t border-border px-5 py-3">
            <AddNameInline existing={eaters} onAdd={onAddName} chipLabel={ADD_A_NAME_CHIP} fullWidth />
          </div>
        ) : null}
      </HouseCard>

      <p className="type-meta text-muted-foreground">{canAct ? PEOPLE_FOOTNOTE : PEOPLE_EATER_FOOTNOTE}</p>

      <RemovePersonDialog
        open={removing != null}
        name={removing?.displayName ?? ""}
        foods={
          removing
            ? rules.filter((rule) => rule.subjectEaterId === removing.id).map((rule) => rule.foodLabel)
            : []
        }
        lastAttendee={Boolean(removing && lastAttendeeEaterId === removing.id)}
        onKeep={() => setRemoving(null)}
        onRemove={() => {
          if (!removing) return;
          void Promise.resolve(onRemove(removing.id)).then(
            () => setRemoving(null),
            () => undefined,
          );
        }}
      />
    </section>
  );
}
