# Ballot / dual-approve

The week ballot is how the household sees seven proposed dinners and clears swaps and dinner requests. Dual-approve means every voting adult must be clear — untouched nights stay as-is; only open swaps and dinner requests block lock. There is no Approve button.

## Sub-features

- `ballot-week` lists one card per night on `/week` with title, pitch, and servings.
- `ballot-empty` shows **No dinners yet** with Finish house setup, Create this week's meals, or Waiting for your Bot….
- `ballot-progress` shows the status strip: your turn, waiting on others, or ready.
- `ballot-no-approve` never labels a control Approve or Skip.
- `ballot-isolation` keeps house A's meals invisible to house B.

## How to get to it (user POV)

- Open **This week** at `http://127.0.0.1:43147/week` after sign-in.
- Open `/` while signed in (redirects to the cooking week).
- Swipe the date strip to **Next week** when a planning week exists.

## Driving it with verify-bot-my-meals

Preconditions:

- Live UI: a **local** loopback Supabase/Postgres with one disposable household, a fulfilled ballot (seven titled dinners), and two voting members. Not a managed project.
- Default launch (keys unset): live UI is unreachable. Use the test recipe below and record the skip.

- **Open the week.** Go to `/week`. The page shows seven `[data-slot="ballot-card"]` nodes (or empty-week copy if no ballot). The heading path is This week, not a hosted `botmymeals.com` origin.
- **Read a card.** Each live dinner card has `[data-slot="meal-card-title"]` and an actions group named `Actions for <title>` when the night is editable. There is no button named Approve.
- **Empty week.** With no meals, the title is `No dinners yet`. CTA is `Finish house setup` when setup is incomplete, `Create this week's meals` when setup is done and no request is pending, or `Waiting for your Bot…` when a ballot request is pending.
- **Status strip.** `[data-slot="status-strip"]` is present when any night exists. `data-state="your_turn"` shows `Clear swaps and dinner requests.` `data-state="waiting_on_others"` shows `Waiting on <name>`. `data-state="ready"` shows `Ready to lock.`
- **Proof (live).** Screenshot the week with at least two cards and the status strip. Save `after.aria.txt`. The snapshot includes meal titles and does not include Approve.
- **Copy and lock-progress tests.** From the repo root run `npx vitest run src/lib/ballot.test.ts src/lib/status-strip.test.ts src/lib/lock.test.ts`. Exit code `0`. Fixtures use household id `h` only — synthetic data.
- **Household isolation.** Run `npm run test:sql` (PGlite, houses A and B). `scripts/sql-tests/recipes-member-read.test.mjs` asserts a member of House B cannot read House A's recipe. Exit code `0`. No network.

## Gotchas

- Default `npm run dev` without keys never reaches `/week` as a household. That is the setup gate. Do not call the gate a passing ballot.
- Dual-approve is not two Approve taps. Voters leave a night as-is by doing nothing. Lock is blocked only by an open swap or dinner request.
- Removed nights and untouched dinners do not block lock. Do not fail the ballot because a night has no vote row.
- Cooking week and one planning week can both be open. Home always opens on cooking. Prove the week that is on screen.
- Creating a ballot in a real house POSTs a wake. Verification must not fire `BOT_WAKE` at a production webhook.
- Never seed two households into one browser profile.
