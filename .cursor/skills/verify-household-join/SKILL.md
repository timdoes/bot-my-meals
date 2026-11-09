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
| `supabase/migrations/20260909130000_manage_members.sql` | original `claim_pending_invites`, `join_household_by_code`, `protect_last_owner` |
| `supabase/migrations/20261108210200_join_one_household.sql` | `claim_pending_invites`, `join_household_by_code` one-house guard |
| `supabase/migrations/20261109012000_memberships_one_user.sql` | `unique (user_id)` preflight + join RPC `unique_violation` mapping |
| `src/lib/supabase/repo.ts` | `fetchSupabaseSession`, `supabaseClaimJoinToken`, `supabaseJoinByCode`, `supabaseInviteMember`, `supabaseRemoveMember`, `supabaseSetMemberRole` |
| `src/lib/join.ts` | `ALREADY_IN_A_HOUSE`, `joinTokenReason`, `parseJoinPeek` |
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
verification/household-join/check.sh finding       # second house via pending/code — must PASS (former finding, PR #119)
```

Read TLC with `/statechart`. Spec: `verification/household-join/HouseholdJoin.tla`. Config: `verification/household-join/HouseholdJoin.cfg`.

## Properties (plain words)

1. **A house with members always keeps an Admin.** Harm: nobody can unlock, invite, or save the bot webhook.
2. **A used, expired, or invalid join link does not add a new member.** Harm: a rotated or old link still adds someone.
3. **A person belongs to at most one household.** Harm: the PWA keeps the oldest membership and hides the other house.

`claim_join_token`, `claim_pending_invites`, and `join_household_by_code` all refuse `"You are already in a house."` `public.memberships` has `unique (user_id)` (`memberships_one_user`) so two sessions cannot both insert after a SELECT that saw no row.

## Former finding (now passing)

PR #119 showed `claim_pending_invites` and `join_household_by_code` inserting a second house. The product fix raises the same exception as `claim_join_token`. That sequential guard is not enough: two overlapping transactions can both pass the SELECT. `unique (user_id)` closes that race; join RPCs map `unique_violation` to the same error. `fetchSupabaseSession` still swallows that error on login so a leftover other-house invite cannot brick the session. `AtMostOneHouse` is an invariant in `HouseholdJoin.cfg`. `check.sh finding` must pass. TLC treats each join RPC as one action and does **not** prove the SQL TOCTOU.

`check.sh` fingerprints are `grep -Fq` string matches, not semantic proof. A commented-out `unique (user_id)` can still match. Catch source mutations with:

```bash
npm run test:sql            # PGlite: preflight leaves duplicates, unique rejects a second row, mutation drop of unique lets a second insert succeed
npm run test:sql:race       # two PostgreSQL sessions; overlapping join_household_by_code; drop-constraint control
```

`test:sql:race` needs PostgreSQL (`JOIN_RACE_DATABASE_URL`, default `postgres://postgres:postgres@127.0.0.1:5432/postgres`). PGlite cannot open two sessions.

## Real bug vs modeling error

- **Fingerprint fail:** `You are already in a house.`, `Keep at least one Admin.`, or `memberships_one_user` disappeared. Intended? Update the spec. Accidental? Restore. Do not treat a fingerprint pass as proof the unique constraint still behaves.
- **TLC fail on last-admin / bad token / one-house:** product bug.
- **`test:sql` / `test:sql:race` fail:** product bug in the SQL invariant. TLC will not catch it.

## Update the model for an intended change

1. Keep the already-in-a-house check on all three join RPCs.
2. Keep `unique (user_id)` on `memberships`. Do not add it without the preflight that refuses existing duplicates and does not delete or merge rows.
3. Keep `protect_last_owner` as one trigger on `UPDATE`/`DELETE` of `memberships`.
4. Run `verification/household-join/check.sh`, `npm run test:sql`, and `npm run test:sql:race`.
5. Move the sync commit only after the spec matches this commit.

## Coverage record

- **Spec:** `verification/household-join/HouseholdJoin.tla`
- **Config:** `verification/household-join/HouseholdJoin.cfg`
- **Bounds:** 2 users, 2 houses, roles owner/voter, token states ok/expired/used/invalid.
- **Not covered by TLC:** eaters; `block_last_attendee_removal`; sign-up without session; join-link multi-use until rotate (intentional: claim does not revoke); concurrent check-then-insert (covered by `npm run test:sql:race` + `unique (user_id)`, not by this spec).
- **Sync commit:** `5ca127d93e934b175fcdfae1a4ca95381ae583fc`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
