---
name: verify-household-join
description: Model-check household membership, join links, pending email invites, and last-admin protection. Use when changing claim_join_token, claim_pending_invites, join_household_by_code, protect_last_owner, or fetchSupabaseSession.
---

# Verify household join

You are checking **who is in which house**. The PWA session is one membership (`fetchSupabaseSession` takes the oldest row). A second house is silent data loss.

Read every TLA+ result with the pstack `/statechart` skill, by that name. Do not copy its commands or paths from memory; they change between releases.

## Does this change touch the verified code?

In scope if the diff includes any of:

| File | Functions |
| --- | --- |
| `supabase/migrations/20260917140000_house_setup_join_tokens.sql` | `peek_join_token`, `claim_join_token`, `create_household`, `create_join_token` |
| `supabase/migrations/20260909130000_manage_members.sql` | `claim_pending_invites`, `join_household_by_code`, `set_member_role`, `remove_member`, `private.protect_last_owner` |
| `src/lib/supabase/repo.ts` | `fetchSupabaseSession`, `supabaseClaimJoinToken`, `supabaseJoinByCode`, `supabaseInviteMember`, `supabaseRemoveMember`, `supabaseSetMemberRole` |
| `src/lib/join.ts` | `joinTokenReason`, `parseJoinPeek` |
| `src/components/join-landing.tsx` | auto-claim |

If none of those changed, stop. If they changed after the **sync commit** below, the model may be stale.

## Run

```bash
verification/household-join/check.sh
```

Java 21+; the script pins TLA+ tools 1.8.0. Must finish in well under a minute (~1s, ~15k distinct states).

```bash
verification/household-join/check.sh broken        # skip last-admin protection — must FAIL
verification/household-join/check.sh broken-token  # claim used/expired/invalid token — must FAIL
verification/household-join/check.sh finding       # second house via pending/code — expected FAIL
```

Read TLC with `/statechart`. Spec: `verification/household-join/HouseholdJoin.tla`. Config: `verification/household-join/HouseholdJoin.cfg`.

## Properties (plain words)

1. **A house with members always keeps an Admin.** Harm: nobody can unlock, invite, or save the bot webhook.
2. **A used, expired, or invalid join link does not add a new member.** Harm: a rotated or old link still adds someone.

`claim_join_token` also refuses `"You are already in a house."` That guard is in the model; it is not enough for the product line "One household."

## Known finding (do not weaken)

**A person can belong to two households.** `claim_pending_invites` inserts every matching email invite with no one-house check. `join_household_by_code` is the same. `fetchSupabaseSession` then `SELECT` the oldest membership and hides the rest.

Harm: the other house's weeks, list, and bot wake are the wrong family's data, or vanish from the PWA.

Counterexample:

1. `u1` is Admin of house A. `u2` `create_household` → house B.
2. Admin of B `supabaseInviteMember` for `u1`'s email (or `u1` still has a pending invite to B).
3. `u1` signs in. `fetchSupabaseSession` calls `claim_pending_invites` **before** reading memberships.
4. `u1` now has rows in A and B. The session keeps A's row (`order created_at asc limit 1`).

Same shape: `u1` already in A calls `join_household_by_code` for B.

Confirm with `verification/household-join/check.sh finding`. A pass of `AtMostOneHouse` means you **fixed** the RPCs — then move that invariant into `HouseholdJoin.cfg` and drop it from the finding config.

## Real bug vs modeling error

- **Fingerprint fail:** `You are already in a house.` or `Keep at least one Admin.` disappeared. Intended? Update the spec. Accidental? Restore.
- **TLC fail on last-admin / bad token:** product bug.
- **`AtMostOneHouse` still fails:** that is the documented finding, not a model mistake, until those RPCs gain the same guard as `claim_join_token`.

## Update the model for an intended change

1. If you add an already-in-a-house check to `claim_pending_invites` / `join_household_by_code`, add it to those TLA+ actions, run `check.sh finding` (should now **pass**, so the finding script will error — then move `AtMostOneHouse` into the main config).
2. Keep `protect_last_owner` as one trigger on `UPDATE`/`DELETE` of `memberships`.
3. Run `verification/household-join/check.sh`.
4. Move the sync commit only after the spec matches this commit.

## Coverage record

- **Spec:** `verification/household-join/HouseholdJoin.tla`
- **Config:** `verification/household-join/HouseholdJoin.cfg`
- **Bounds:** 2 users, 2 houses, roles owner/voter, token states ok/expired/used/invalid. ~15k distinct states.
- **Not covered:** eaters; `block_last_attendee_removal`; sign-up without session; join-link multi-use until rotate (intentional: claim does not revoke).
- **Sync commit:** `SYNC_COMMIT_PLACEHOLDER`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
