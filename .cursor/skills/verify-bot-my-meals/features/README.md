# Bot My Meals verification map

This directory is the maintained source for verifying user-facing behavior of the Bot My Meals household PWA. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `VERIFY_RUN_ID` set and `.cursor/skills/verify-bot-my-meals/scripts/verify.sh launch`.
- App URL is `http://127.0.0.1:43147`. Command is `npm run dev` (port 43147).
- Default launch leaves `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset. Doctor mode is `setup-gate-missing-keys`.
- Never point `NEXT_PUBLIC_SUPABASE_*` at production or a managed Supabase project. Loopback local Supabase/Postgres, PGlite, or test data only.
- Household data stays inside one household. Do not reuse another house's session, cookies, or fixtures.
- Run `verify.sh doctor` and require the expected URL, pid, and mode.
- Never drive an instance this run did not start.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer ARIA roles, accessible names, and `data-slot` attributes over CSS position.
- Treat every command as literal.
- Default launch drives **setup** only. Other features need a local disposable household or the PGlite / Vitest recipe in that file.
- If a live-UI precondition is missing, record the failure in that feature's Gotchas. Do not substitute a different feature and call it verified.
- Restore nothing on the hosted product — there is no hosted product in this run. Cleanup kills our pid and leaves evidence on disk.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot and a screenshot that shows Bot My Meals (wordmark or `Set up the real house`).
- HTTP proof includes status, headers, and a body excerpt with the named heading or `data-slot`.
- Test proof includes the exact command, stdout, stderr, and exit code.
- Record the feature ID and entry point with every artifact under `/tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/`.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- Paste real output into the PR Proof section. The Proof job rejects placeholders.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-bot-my-meals` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Setup](./setup.md) covers the first-run setup gate, Continue setup, and the five-step checklist. This is the feature the default launch can drive.
- [Ballot / dual-approve](./ballot-dual-approve.md) covers the week ballot, empty-week CTAs, and voter progress.
- [Swap / remove](./swap-remove.md) covers requesting a swap, removing a night, and the confirmations.
- [Lock status](./lock-status.md) covers Ready to lock, Lock this week, and the Locked chip.
- [Past-day Made chip](./past-day-made-chip.md) covers the Made chip on a past dinner night and the hidden Swap/Remove actions.
