---
name: verify-shopping-list
description: Model-check shopping list create-at-lock and in-place rebuild (checked lines, redact-until-locked, cooking vs planning). Use when changing lock_week list insert, rebuild_week_shopping_list, reconcileShoppingItems, redactUntilLocked, or unlock list delete.
---

# Verify shopping list

You are checking the **shopping list build/rebuild** state machine. A cold agent can tell whether a change is in scope, run one command, and tell a real bug from a modeling mistake.

Read every TLA+ result with the pstack `/statechart` skill, by that name. Do not copy its commands or paths from memory; they change between releases.

## Does this change touch the verified code?

In scope if the diff includes any of:

| File | Functions |
| --- | --- |
| `src/lib/shopping.ts` | `dinnerShoppingLines`, `reconcileShoppingItems`, `withRebuiltShoppingLists`, `shoppingListsToRebuild` |
| `src/lib/visibility.ts` | `redactUntilLocked` |
| `src/lib/supabase/repo.ts` | `supabaseLockWeek`, `supabaseRebuildWeekShoppingList`, `supabaseSyncShoppingLists`, `supabaseUnlockWeek`, `supabaseToggleItem` |
| `supabase/migrations/20261004180000_shopping_list_rebuild.sql` | original `public.rebuild_week_shopping_list` |
| `supabase/migrations/20261108210100_unlock_week_atomic.sql` | `public.unlock_week`, `public.rebuild_week_shopping_list` locked-only |
| `supabase/migrations/20261022120000_week_planned_from.sql` | `public.lock_week` list delete+insert, `private.week_shopping_lines` |

If none of those changed, stop. If they changed after the **sync commit** below, the model may be stale.

## Run

```bash
verification/shopping-list/check.sh
```

Java 21+; the script pins TLA+ tools 1.8.0. Must finish in well under a minute.

```bash
verification/shopping-list/check.sh broken         # rebuild unchecks every surviving line — must FAIL
verification/shopping-list/check.sh broken-redact  # show list while voting — must FAIL
verification/shopping-list/check.sh finding        # leftover list after unlock — must PASS (former finding, PR #117)
```

Read TLC with `/statechart`. Spec: `verification/shopping-list/ShoppingList.tla`. Config: `verification/shopping-list/ShoppingList.cfg`.

## Properties (plain words)

1. **The shopping list is not shown until that week is locked.** Harm: the family shops, then lock replaces the list.
2. **A shopping_lists row exists only while that week is locked.** Harm: rebuild mutates groceries after unlock.
3. **A checked line whose amount did not change stays checked across rebuild.** Harm: already-bought groceries get unchecked and bought again.
4. **Checked lines belong to that week's list only (cooking vs planning do not share rows).** Harm: checking milk for this week clears it on next week.

## Former finding (now passing)

PR #117 showed `supabaseUnlockWeek` updating `weeks.status` then deleting the list in a second statement. The product fix is `public.unlock_week` (status + delete in one function) and `rebuild_week_shopping_list` returning unless the week is locked (`FOR UPDATE`). `ListOnlyWhenLocked` is an invariant in `ShoppingList.cfg`. `check.sh finding` must pass.

## Real bug vs modeling error

- **Fingerprint fail:** a named guard string is gone. Update `ShoppingList.tla` if intended; otherwise restore.
- **TLC fail on `check.sh`:** product bug unless the action is not one step in the named function.
- **Pass after changing rebuild math without updating the spec:** stale. Do not treat as proof.

Rebuild is one PL/pgSQL function. Lock create is one `lock_week` function (delete list + insert). Unlock is one `unlock_week` RPC — model it as one action.

## Update the model for an intended change

1. Point each action at the new function.
2. Keep lock-create destructive (new list, checks wiped) unless the code changed that.
3. Show fail on `check.sh broken` (or a new `Broken*` flag) before claiming the new code holds.
4. Run `verification/shopping-list/check.sh`.
5. Move the sync commit only after the spec matches this commit.

## Coverage record

- **Spec:** `verification/shopping-list/ShoppingList.tla`
- **Config:** `verification/shopping-list/ShoppingList.cfg`
- **Bounds:** 2 weeks (cooking, planning), 1 item (`milk`), quantities `{0, 1}`.
- **Assumptions:** no store-section merge bugs; `planned_from` night coverage is week-lock's job; bot `fill_pending` writing items as service role is not modeled.
- **Sync commit:** `c3be7f5d10a9266f9e24f53cabf8ee2f809d150e`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
