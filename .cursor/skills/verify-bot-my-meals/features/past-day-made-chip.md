# Past-day Made chip

Once a dinner night's house-local calendar day has ended, that card becomes review-only. A covered night with a recipe shows a **Made** chip, hides Swap and Remove, and keeps the title muted. Today and future nights stay actionable.

## Sub-features

- `made-chip` renders `[data-slot="made-chip"]` with text `Made` on a past, covered, recipe-ready dinner.
- `made-no-actions` hides Swap and Remove on that card.
- `made-not-today` leaves today's card without a Made chip.
- `made-not-planned` uses `Not planned` for a past night the lock never covered.
- `made-timezone` treats past as house timezone midnight, not the viewer's UTC day.

## How to get to it (user POV)

- Open `/week` on a cooking week that includes a night before today in the household timezone.
- Open a past week from **House → Past weeks** or by swiping the date strip backward (titles only).

## Driving it with verify-bot-my-meals

Preconditions:

- Live UI: local loopback household, a week whose `night_date` values include a date before `todayInTimeZone` for that house, and a recipe on that past night so the chip is Made (not No recipe).
- Default launch: live UI unreachable. Use the test recipe and record the skip.

- **Find a past card.** On `/week`, a `[data-slot="ballot-card"][data-past="true"][data-chip="made"]` shows `[data-slot="made-chip"]` = `Made`.
- **No vote actions.** That card has no button named `Swap <title>` and no button named `Remove <title>`.
- **Today stays open.** A card for today (`data-past` absent or false, no made chip) still has Swap/Remove when the week is unlocked and the user can vote.
- **Not planned.** A past night the lock did not cover shows `[data-slot="not-planned-chip"]` = `Not planned`, not Made.
- **Proof (live).** Screenshot the past Made card next to a today/future card. Save aria text that includes `Made` and excludes Swap/Remove on the past card.
- **Render tests.** Run `npx vitest run src/lib/past-meal-card.test.ts src/lib/week-chrome.test.ts`. Exit code `0`. `MADE_CHIP_LABEL` is `Made`. Static markup of `BallotCard` with `made: true` contains `>Made<` and does not match Swap/Remove buttons. `mealNightPhase` is `past` only when `nightDate < todayIso`.

## Gotchas

- Past is house timezone, not UTC. A Sunday night in Denver can still be "today" when it is already Monday UTC. Do not freeze a clock in UTC and call a still-today night Made.
- `No recipe` and `Not planned` are different chips. Only `made-chip` proves this feature.
- Unlocking the week does not make a past night editable. `dinnerNightActionsOpen` is false when `past` is true.
- Past via the date strip is titles only. House → Past weeks opens the same week in the strip. Either entry is valid; record which one you used.
- Do not load a real family's past week from a hosted project to see a Made chip.
