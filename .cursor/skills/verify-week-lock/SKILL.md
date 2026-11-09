---
name: verify-week-lock
description: Model-check the weekly ballot → lock state machine (swap/remove, dual/passive approve, lock/unlock, past-day Made chip). Use when changing votes, lock_week, checkWeekLock, dinnerNightActionsOpen, cookingNightChip, planned_from, or unlock.
---

# Verify week lock

You are checking the **ballot → lock** state machine of Bot My Meals. A cold agent can tell whether a change is in scope, run one command, and tell a real bug from a modeling mistake.

Read every TLA+ result with the pstack `/statechart` skill, by that name. Do not copy its commands or paths from memory; they change between releases.

## Does this change touch the verified code?

In scope if the diff includes any of:

| File | Functions |
| --- | --- |
| `src/lib/lock.ts` | `canActOnBallot`, `nightLifecycle`, `latestVoteForMeal`, `checkWeekLock`, `isLockBlockingLifecycle`, `isNightOff` |
| `src/lib/week-chrome.ts` | `nightStaysLocked`, `dinnerNightActionsOpen`, `nightCoveredByLock`, `cookingNightChip` |
| `src/lib/supabase/repo.ts` | `supabaseSetVote`, `supabaseLockWeek`, `supabaseUnlockWeek`, `supabaseProposeReplacement` |
| `src/app/week/page.tsx` | vote / chip / `dinnerNightActionsOpen` wiring |
| `src/components/lock-bar.tsx` | `checkWeekLock` with `todayIso` |
| `supabase/migrations/20260912205000_ballot_passive_lock.sql` | original `private.enforce_week_lock` |
| `supabase/migrations/20261108210000_enforce_week_lock_remaining_nights.sql` | `private.enforce_week_lock` remaining-night cutoff |
| `supabase/migrations/20261022120000_week_planned_from.sql` | `public.lock_week` (`planned_from = coalesce(...)`) |

If none of those changed, stop. If they changed after the **sync commit** below, the model may be stale — update it before trusting a pass.

## Run

From the repo root (Java 21+; the script pins TLA+ tools 1.8.0 and downloads `tla2tools.jar` if needed):

```bash
verification/week-lock/check.sh
```

That fingerprints the guards in the files above, then model-checks `verification/week-lock/WeekLock.tla` with `WeekLock.cfg`. It must finish in well under a minute.

Other modes (not the default):

```bash
verification/week-lock/check.sh broken       # lock without enforce_week_lock blockers — must FAIL
verification/week-lock/check.sh broken-chip  # Made chip ignores past/covered — must FAIL
verification/week-lock/check.sh finding      # leftover past swap — must PASS (former finding, PR #116)
```

Read the TLC output with `/statechart`. Spec: `verification/week-lock/WeekLock.tla`. Config: `verification/week-lock/WeekLock.cfg`.

## Properties (plain words)

1. **A locked week has no open swap or dinner request on remaining nights.** Harm: the family cooks or shops for a night they asked to change.
2. **The Made chip appears only on a past night the first lock covered, with a recipe, that was not removed.** Harm: a night that was never locked looks cooked.
3. **Tonight and future nights never show Made.** Harm: a dinner that has not happened yet is marked cooked.
4. **`planned_from` from the first lock does not move on unlock or re-lock.** Harm: a past night flips between Made and Not planned.
5. **When remaining nights are clear, SQL can lock too.** Harm if this fails: Lock this week is shown, then the RPC fails.

## Former finding (now passing)

PR #116 showed `checkWeekLock(..., todayIso)` ignoring a leftover swap on a past night while `private.enforce_week_lock` still counted every night. The product fix ignores nights before house-local today in the trigger (votes stay; history is not cleared). `ClientReadyImpliesSqlCanLock` is an invariant in `WeekLock.cfg`. `check.sh finding` must pass.

## Real bug vs modeling error

- **Fingerprint fail** (`covered code no longer matches the model`): you removed or reworded a guard. If that was intended, update `WeekLock.tla` to match the new code, then run TLC. If it was accidental, restore the guard.
- **TLC invariant fail on `check.sh` (ok):** the model of the current code breaks a property. Treat as a product bug unless you can show the model took a step the code cannot.
- **TLC pass after you changed lock behavior but did not update the spec:** stale model. Do not treat as proof. Move the sync commit only after the spec matches.

A modeling error looks like a step named in `WeekLock.tla` that is not one statement in the named function, or a constant bound that hides the bug (raise the bound only if TLC ran out of states without a counterexample you can justify).

## Update the model for an intended change

1. Open the named function and the TLA+ action that points at it.
2. Keep the same atomicity: one SQL RPC or one upsert = one action. Do not merge `lock_week` with the later `requestBotWake`.
3. Show the property failing on a broken variant (`check.sh broken` or a new `Broken*` constant) before you claim the new code holds.
4. Run `verification/week-lock/check.sh`.
5. Move the sync commit SHA below only after that pass describes this commit.

## Coverage record

- **Spec:** `verification/week-lock/WeekLock.tla`
- **Config:** `verification/week-lock/WeekLock.cfg`
- **Bounds:** 2 nights, today index 0..2, one actor role at a time, choices `{none, swap, remove, request_new_meal}`. ~2k distinct states.
- **Assumptions:** one cooking week; food-rule allergy gate on `lock_week` is not modeled; `supabaseSetVote` is the PWA path (`dinnerNightActionsOpen`). Votes RLS does not check week status — a stale tab calling the upsert after lock is **not covered**. Leftover past votes are ignored, not deleted.
- **Sync commit:** `b8b4560ad003acf3f595b6bbb06f86455de6161f`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
