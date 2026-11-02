# Lock status

Lock status is how the household sees whether the week can lock, is ready, or is already locked. The week locks after swaps and dinner requests are cleared. Removed nights and untouched dinners do not block. After lock, recipes and the shopping list open for that week only.

## Sub-features

- `lock-your-turn` shows `Clear swaps and dinner requests.` while this voter still has an open swap or request.
- `lock-waiting` shows `Waiting on <name>` while another voter still has one.
- `lock-ready` shows `Ready to lock.` and the lock bar **Lock this week** (or **Lock the rest of this week** when a past night exists).
- `lock-locked` shows status-strip title `This week is locked.` and chip `Locked`.
- `lock-blockers` refuses to lock while a swap or dinner request is open.

## How to get to it (user POV)

- Stay on `/week` and read `[data-slot="status-strip"]`.
- When ready, tap **Lock this week** / **Lock the rest of this week** on `[data-slot="lock-bar"]`.
- After lock, read the `Locked` chip (`[data-slot="week-locked-chip"]`) on the title row.
- Open `/list` or `/week/recipes` — pre-lock they say to lock first; post-lock they show the list or recipes.

## Driving it with verify-bot-my-meals

Preconditions:

- Live UI: local loopback household, a week with dinners, no open swap or dinner request, and (for lock) an admin session. Not a managed project.
- Default launch: live UI unreachable. Use the test recipe and record the skip.

- **Your turn.** With an open swap on your membership, `[data-slot="status-strip"][data-state="your_turn"]` titles `Clear swaps and dinner requests.` The lock bar is absent.
- **Ready.** Clear the swap. Strip `data-state` becomes `ready` and the title is `Ready to lock.` `[data-slot="lock-bar"]` shows a button `Lock this week` (no past night) or `Lock the rest of this week` (a past night exists). Subline is `Locks N dinners.` or `Locks N dinners from today on.`
- **Lock.** Choose that button. It shows `Locking…` then the strip becomes `data-state="locked"` with title `This week is locked.` and secondary `Recipes and the shopping list are open.` The title row shows chip `Locked`.
- **Blocked lock.** Put a swap back on an unlocked week. `checkWeekLock` is not ready. The lock bar is gone. Do not force lock through a test-only RPC from the browser.
- **Proof (live).** Screenshot ready (lock bar visible) and locked (Locked chip + strip). Save aria snapshots. Confirm `/list` is no longer the pre-lock empty.
- **Logic tests.** Run `npx vitest run src/lib/lock.test.ts src/lib/status-strip.test.ts src/lib/week-chrome.test.ts src/lib/lock-success.test.ts`. Exit code `0`.
- **SQL lock gate.** Run `npm run test:sql` and keep `scripts/sql-tests/setup-and-lock.test.mjs` passing. PGlite only; synthetic household ids.

## Gotchas

- The lock bar is omitted when the week is already locked, when lock is not ready, or when no lockable dinner remains. Absence of the bar is not a broken page if the strip still explains the state.
- A cooking week with a past night changes the CTA to **Lock the rest of this week**. Assert the label that matches the dates on screen.
- Unlock is admin-only (`Unlock week`). Users see the Locked chip without Unlock.
- Recipes and shopping are per week. Never merge cooking + planning lists as proof.
- A database trigger refuses to lock if a swap or dinner request is still open. If live lock fails, read the reason — do not point at a hosted house to "just lock it".
- Food-rule hits disable the lock bar (`Needs a change before this night is approved`). That is a block, not a missing feature.
