---
name: verify-bot-wake
description: Model-check bot wake / app-event webhook (week_locked, debounce per household host, Wake your Bot before Create meals). Use when changing postBotWake, wakeAllowed, /api/bot/wake, requestWeekBallot, or debounce keys.
---

# Verify bot wake

You are checking the **wake on app event** path: household POST `/api/bot/wake` then `postBotWake` to that house's webhook. One household per run is a host string in the JSON, not a UUID.

Read every TLA+ result with the pstack `/statechart` skill, by that name. Do not copy its commands or paths from memory; they change between releases.

## Does this change touch the verified code?

In scope if the diff includes any of:

| File | Functions |
| --- | --- |
| `src/lib/bot-wake.ts` | `wakeAllowed`, `postBotWake`, `debounceKey`, `botWakeBody`, `shouldWakeNeedsWork` |
| `src/app/api/bot/wake/route.ts` | `POST`, `PUT`, `wakeFacts` |
| `src/lib/bot-wake-http.ts` | `requireMember` |
| `src/lib/bot-wake-client.ts` | `requestBotWake`, `fetchBotWakeConfigured` |
| `src/components/supper-provider.tsx` | `requestWeekBallot` (`FINISH_WAKE_BEFORE_CREATE`), `lockWeek` wake |
| `src/lib/supabase/repo.ts` | `supabaseCurrentWeekLocked` |

If none of those changed, stop. If they changed after the **sync commit** below, the model may be stale.

## Run

```bash
verification/bot-wake/check.sh
```

Java 21+; the script pins TLA+ tools 1.8.0. Must finish in well under a minute.

```bash
verification/bot-wake/check.sh broken         # week_locked without supabaseCurrentWeekLocked — must FAIL
verification/bot-wake/check.sh broken-create  # Create meals without Wake your Bot — must FAIL
```

Read TLC with `/statechart`. Spec: `verification/bot-wake/BotWake.tla`. Config: `verification/bot-wake/BotWake.cfg`.

## Properties (plain words)

1. **A `week_locked` webhook is sent only while that household's week is locked.** Harm: the bot writes recipes as if the week were locked while it is still a ballot.
2. **No successful webhook POST until Wake your Bot is configured.** Harm: lock/create look like they woke the bot; nothing arrives.
3. **At most one successful POST per `household_host:event` per debounce window.** Harm: the shared bot is flooded and may mix or skip household work.
4. **Create this week's meals does not run before the webhook URL is saved.** Harm: a ballot is queued with no bot to fill it.

## Real bug vs modeling error

- **Fingerprint fail:** a named guard string is gone. Update `BotWake.tla` if intended.
- **TLC fail on `check.sh`:** product bug unless `PostWake` took a step `POST` / `postBotWake` cannot.
- Two hosts in the spec are two DIY `household_host` values sharing one webhook bot. Mixing their `posted` counts would be a model error if a single action wrote both; the code keys debounce by host.

**Not a pass to weaken:** `postBotWake` marks the debounce **before** `fetch`. A failed HTTP POST still consumes the 30s window (`bot-wake.test.ts`). That is intentional in the current code; the spec models successful delivery only. Do not "fix" the spec to retry on failure unless the code changes.

## Update the model for an intended change

1. Keep `wakeAllowed` and debounce as separate guards on `PostWake`.
2. `requestWeekBallot` still requires `fetchBotWakeConfigured` unless you are removing that product rule — then `BrokenCreateGuard` should start failing `CreateRequiresWakeConfig` until you drop the property (do not drop it silently).
3. Run `verification/bot-wake/check.sh` and `check.sh broken`.
4. Move the sync commit only after the spec matches this commit.

## Coverage record

- **Spec:** `verification/bot-wake/BotWake.tla`
- **Config:** `verification/bot-wake/BotWake.cfg`
- **Bounds:** 2 hosts, events `{week_locked, check_now}`, one debounce window flag per host:event. 260 distinct states on the last check.
- **Not covered:** `needs_work` false→true edge (`shouldWakeNeedsWork` — unit tests in `src/lib/bot-wake.test.ts`); in-memory debounce not shared across Worker isolates; webhook `Authorization` header; food-rules live read after status.
- **Sync commit:** `c6925f686a66877cbe221ce4b366bf2ff9f56e20`

Move the sync commit only after you confirm the model matches the code at the new SHA.

After merges that skipped this skill, use `/maintain-formal-verification-skill`.
