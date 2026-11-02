# Swap / remove

A voting member can **Swap** a dinner (optional note for the bot) or **Remove** a night (confirm, then no meal). Those actions are visible live. A swap resets that row's votes. Remove does not keep a note.

## Sub-features

- `swap-open` opens **Request a swap** from the card button named `Swap <title>`.
- `swap-send` sends with **Swap Meal** and then shows **Swap requested**.
- `remove-confirm` opens **Remove this dinner?** and confirms with **Remove dinner**.
- `remove-keep` dismisses with **Keep** and leaves the dinner.
- `swap-remove-copy` keeps confirmation phrases and aria-labels stable.

## How to get to it (user POV)

- On `/week`, choose **Swap** or **Remove** on an editable dinner card.
- Open `/week/<mealId>` and use the same **Swap** / **Remove** buttons.

## Driving it with verify-bot-my-meals

Preconditions:

- Live UI: local loopback household, unlocked cooking (or planning) week, a titled dinner that is not past and not locked. Two voters if you need to prove a swap resets the other vote.
- Default launch: live UI unreachable. Use the test recipe and record the skip.

- **Swap open.** Choose the button named `Swap <meal title>` (visible label `Swap`). A sheet titled `Request a swap` appears. Helper text is `Optional — tell the meal bot what would work better.` The textarea is labeled `Reason`.
- **Swap send.** Type `too heavy` and choose `Swap Meal`. The sheet closes. The card shows `Swap requested` and `data-swapped="true"`. Confirmation copy is `You want a swap`.
- **Remove open.** On another editable night, choose `Remove <meal title>`. Dialog title is `Remove this dinner?`. Body includes that the night will have no meal.
- **Remove keep.** Choose `Keep`. The dinner title is still on the card. Swap/Remove remain.
- **Remove confirm.** Open Remove again and choose `Remove dinner`. The night becomes empty (`No dinner` / empty-day card). Confirmation copy is `You removed this night`.
- **Proof (live).** Capture before (actions visible), after swap (Swap requested), and after remove (no dinner). Include aria snapshots. Do not include another household's meals.
- **Copy tests.** Run `npx vitest run src/lib/ballot.test.ts`. Exit code `0`. Expect `voteActionLabel("swap", "Miso butter noodles")` → `Swap Miso butter noodles`, `voteConfirmation("remove")` → `You removed this night`, and no string `approve` or `skip` in those phrases.

## Gotchas

- Past nights and locked nights hide Swap/Remove. If you only see a **Made** chip, you are on [past-day-made-chip](./past-day-made-chip.md), not this feature.
- A leftover or night-off card is muted. Drive an ordinary titled dinner.
- Swap may persist a note; remove never does. Do not assert a remove note.
- Last-writer-wins: a second voter's swap replaces the first. Toast copy lives in lock tests; do not treat a missing toast as a failed swap if the card shows Swap requested.
- Do not run this against a hosted week. A swap POSTs household data and can wake the bot.
