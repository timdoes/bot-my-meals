---
name: verify-bot-my-meals
description: Drive the Bot My Meals household PWA locally the way a user does — launch with npm run dev on port 43147, doctor the instance, exercise one mapped feature, capture proof, and clean up. Use when proving a UI or household-behavior change, filling a PR Proof section, or verifying setup, ballot/dual-approve, swap/remove, lock status, or the past-day Made chip.
---

# Verify Bot My Meals

You are writing for the next agent that has never seen this app. Drive the **real household PWA**, not an internal setter and not a hosted household.

This repo already requires a filled **Proof** section on every PR (`.github/pull_request_template.md`; the Proof job runs `scripts/check-pr-proof.mjs`). This skill is how you produce that proof from a local run.

Read [features/README.md](features/README.md) first, then the one feature file you will drive. One feature per verification run. One feature per PR.

Keep the map honest as the app changes with `/maintain-verification-skill`.

## Data rules (do not break)

- **Never** point this run at production or a managed Supabase project. That includes any `*.supabase.co` URL, any hosted `botmymeals.com` household, and any Worker env copied from a live house.
- Allowed data: **unset** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (setup gate), a **local** Supabase/Postgres on loopback (`http://127.0.0.1:54321` from `supabase start`), the **PGlite in-memory** chain the SQL tests already use (`npm run test:sql`), or **synthetic test data** in Vitest.
- **Never** put a service-role key in `.env.local`, `.dev.vars`, git, Worker vars, or this run's environment.
- Household rows are scoped by `household_id` (RLS). **Never mix households.** Do not reuse cookies, storage, or fixtures from house A on house B. SQL tests that need two houses create synthetic House A and House B in one PGlite and assert they cannot read each other.
- There is no localStorage household fallback. Missing keys show the setup gate, not a device-only family.

## Launch

Default verification launch is the **setup gate**: no public keys. That is a usable first-run state, not an error.

```bash
cd <repo-root>
test -d node_modules || npm ci
export VERIFY_RUN_ID="verify-$(date -u +%Y%m%dT%H%M%SZ)-setup"
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset BOT_WAKE_WEBHOOK_URL BOT_WAKE_WEBHOOK_KEY
unset NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY
.cursor/skills/verify-bot-my-meals/scripts/verify.sh launch
```

What that does:

1. Refuses to start if `NEXT_PUBLIC_SUPABASE_URL` is set to anything other than loopback.
2. Refuses to start if port **43147** is already listening (do not double-drive a shared instance).
3. Runs this repo's documented command: `npm run dev` (`next dev -p 43147 -H 0.0.0.0` from `package.json`).
4. Waits until `GET http://127.0.0.1:43147/` returns HTTP 2xx.

Ready means the HTML is Bot My Meals, not just that a process answered:

- Default (keys unset): heading **Set up the real house**, `data-slot="backend-setup-gate"`, `data-setup-status="missing"`.
- Log line from Next is useful (`Ready` / `Local:`) but not sufficient by itself.

Open **http://127.0.0.1:43147** (or `/login`, `/setup` — same `LoginHome` + setup gate).

Do **not** copy `.env.example` to `.env.local` for the default run. Filling those keys from a live project violates the data rules. A local `supabase start` loopback pair is the only allowed way to leave the setup gate during verification.

Teardown is **Cleanup** below. Launch writes a pidfile under `/tmp/verify-bot-my-meals/runs/$VERIFY_RUN_ID/dev.pid`.

## Doctor

Run this first whenever anything looks off, and once after every launch.

```bash
export VERIFY_RUN_ID="<same id>"
.cursor/skills/verify-bot-my-meals/scripts/verify.sh doctor
```

Doctor is read-only. It must print `verify.sh doctor: OK` and all of:

- the pid this run started
- `url: http://127.0.0.1:43147`
- `http: 200` (or another 2xx)
- `mode: setup-gate-missing-keys` on the default launch
- `supabase: <unset — setup gate>` on the default launch

Fail and stop if the port is owned by a different tree, the pid is dead, the body is not Bot My Meals, or the env points at a non-loopback Supabase URL.

## Drive

Harness, in order:

1. **This skill's helper** for launch / doctor / cleanup.
2. **Browser** (Playwright MCP, or a one-off Playwright/CDP script — do not add Playwright as a project dependency). Prefer roles, accessible names, and `data-slot` attributes from this repo.
3. **HTTP** (`curl`) for the setup gate and for "is it up?"
4. **Vitest + PGlite** for household-scoped logic that the default launch cannot reach without a local database.

Stable handles (use these, not coordinates):

| Surface | Handle |
| --- | --- |
| Setup gate root | `[data-slot="backend-setup-gate"]` |
| Setup title | heading `Set up the real house` |
| Setup CTA | button name `Continue setup` (`aria-label` is the same) |
| Setup checklist | `[data-slot="setup-checklist"]` |
| Ballot card | `[data-slot="ballot-card"]` |
| Swap | button name `Swap <meal title>` |
| Remove | button name `Remove <meal title>` |
| Swap sheet | heading `Request a swap`; send `Swap Meal` |
| Remove confirm | heading `Remove this dinner?`; confirm `Remove dinner` |
| Status strip | `[data-slot="status-strip"]` with `data-state` `your_turn` / `waiting_on_others` / `ready` / `locked` |
| Lock bar | `[data-slot="lock-bar"]` button `Lock this week` or `Lock the rest of this week` |
| Locked chip | `[data-slot="week-locked-chip"]` text `Locked` |
| Made chip | `[data-slot="made-chip"]` text `Made` |

Routes a user actually opens: `/`, `/login`, `/setup` (setup gate or sign-in), `/week` (ballot), `/week/[mealId]`, `/week/recipes`, `/list`, `/house`, `/settings`, `/join/<token>`.

Default launch can only drive **setup**. Ballot, swap/remove, lock, and the Made chip need a signed-in household on **local** Supabase/Postgres. If that precondition is missing, report the live path **unreachable** with the reason in that feature's Gotchas — do not pretend the setup gate is those features. Then run the feature file's PGlite / Vitest recipe. That is still proof of the logic; it is not proof of the live UI path.

Household isolation while driving: one browser profile per household. Never attach house B's session to house A's week.

## Evidence

Proof artifacts live at:

```text
/tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/
```

Cleanup must not delete that directory. After cleanup, confirm the files are still there.

Standards:

- Exercise the real user path (open the URL, click the named control, read the resulting screen). Do not call `lockWeek()` / vote helpers from a test-only entry and call that UI proof.
- Capture **the action and the resulting state**, not only the final screen.
- Side effects: HTTP body, `data-slot` / `data-state` / `data-setup-status`, Vitest or `npm run test:sql` output, and a second read of the same view.
- Mocks only at a production boundary that already isolates the system (PGlite instead of hosted Postgres is the allowed stand-in). Never mock the setup gate away.
- No secrets in artifacts. Redact keys if a local `.env` ever leaks into a log. Do not screenshot a real household.

Minimum files for a UI drive:

```text
/tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/
  feature.txt          # feature id + entry point
  doctor.txt           # full doctor output
  before.png           # screen before the action
  after.png            # screen after the action
  after.aria.txt       # accessibility snapshot after the action
  http-home.body       # GET / body or excerpt
  http-home.headers
```

Minimum files for a test-only drive (live UI unreachable):

```text
/tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/
  feature.txt
  skip-live-ui.txt     # which precondition failed
  vitest.txt           # exact command + output
  sql.txt              # npm run test:sql output when the feature file names it
```

Paste the real command output into the PR **Proof** section. The Proof job rejects an empty section and rejects the template placeholder.

## Cleanup

Kill only what this run started: the pidfile process, its descendants (`next-server` is a child of `npm run dev`), and the port-43147 listeners recorded at launch. Never `pkill -f next` / `pkill node`.

```bash
export VERIFY_RUN_ID="<same id>"
.cursor/skills/verify-bot-my-meals/scripts/verify.sh cleanup
test -d /tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID
```

Cleanup removes `/tmp/verify-bot-my-meals/runs/$VERIFY_RUN_ID` (pidfile, logs, scratch HTTP dumps). It keeps `/tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID`. After a failed iteration, run cleanup before the next launch so port 43147 is free.

Do not delete proof artifacts. Do not write household data into the repo.

## Helpers

`scripts/verify.sh` is executable. Invocation is always with `VERIFY_RUN_ID` set:

```bash
VERIFY_RUN_ID=verify-demo .cursor/skills/verify-bot-my-meals/scripts/verify.sh launch
VERIFY_RUN_ID=verify-demo .cursor/skills/verify-bot-my-meals/scripts/verify.sh doctor
VERIFY_RUN_ID=verify-demo .cursor/skills/verify-bot-my-meals/scripts/verify.sh cleanup
```

No other helper is shipped. Browser actions go through Playwright MCP (or curl). Household logic goes through:

```bash
npx vitest run src/lib/setup.test.ts src/lib/ballot.test.ts src/lib/lock.test.ts src/lib/status-strip.test.ts src/lib/past-meal-card.test.ts src/lib/week-chrome.test.ts
npm run test:sql
```

Those tests use PGlite or in-process fixtures. They never open a hosted project.

## Isolation

Port **43147** is shared. Two verification instances cannot run side by side in one checkout. If doctor or launch reports the port is taken, stop. Driving someone else's `next dev` corrupts the session.

## First-run proof (generator)

This skill is not a draft until someone has: launched, doctored, driven **setup**, captured evidence, cleaned up, and confirmed the evidence directory still exists. That first-run output belongs in the PR Proof section.
