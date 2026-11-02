# Setup

Setup is the first-run gate when the two public Supabase keys are missing, partial, or invalid. The user sees **Set up the real house**, not a device-only household. Tapping **Continue setup** opens the five-step checklist.

## Sub-features

- `setup-gate` shows the gate on `/`, `/login`, `/setup`, `/join`, and `/login/new-password` when keys are missing.
- `setup-continue` reveals the checklist from **Continue setup**.
- `setup-checklist` lists host, Supabase, migrations, public keys, and install — never a localStorage household.
- `setup-status` explains missing vs partial vs invalid keys.
- `setup-copy-tests` keeps the gate copy and route aliases stable without a database.

## How to get to it (user POV)

- Open `http://127.0.0.1:43147/` with both public keys unset.
- Open `http://127.0.0.1:43147/login`.
- Open `http://127.0.0.1:43147/setup`.
- Open `http://127.0.0.1:43147/join` or `/login/new-password` with keys unset.

## Driving it with verify-bot-my-meals

Preconditions:

- `VERIFY_RUN_ID` is set and `scripts/verify.sh doctor` reports `mode: setup-gate-missing-keys`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset.
- No `.env.local` is pointing at a hosted project.

- **Home entry.** Open `/`. Run `curl -sS -D /tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/http-home.headers -o /tmp/verify-bot-my-meals/evidence/$VERIFY_RUN_ID/http-home.body http://127.0.0.1:43147/`. HTTP is 2xx. The body contains `Set up the real house`, `data-slot="backend-setup-gate"`, and `data-setup-status="missing"`. It does not contain a week ballot.
- **Login and setup aliases.** Repeat the GET for `/login` and `/setup`. Both bodies contain `Set up the real house` and `Continue setup`.
- **Status line.** The page shows `Nothing is connected yet. Tap Continue setup — it is a short list.` in `[data-slot="setup-status"]`.
- **Open checklist.** Choose **Continue setup**. In the browser, click the button named `Continue setup`. `[data-slot="setup-checklist"]` appears. The CTA row `[data-slot="setup-cta"]` is gone.
- **Checklist content.** The ordered list includes `Host it on Cloudflare (free)`, `Create a Supabase project (free)`, `Apply the house rules`, `Paste the public URL and anon key`, and `Open the app and install it`. The Worker name `bot-my-meals` is present. `{handle}.botmymeals.com` is named only as a hostname **not** to use.
- **Proof.** Save `before.png` on the gate, `after.png` and `after.aria.txt` after Continue setup. Both screenshots show Bot My Meals and **Set up the real house**. The after snapshot includes the five step titles.
- **Copy tests.** From the repo root run `npx vitest run src/lib/setup.test.ts src/lib/config.test.ts`. Exit code `0`. These tests are in-process; they do not open a hosted project.

## Gotchas

- A 200 from Next is not enough. A misconfigured run that still has keys will skip the gate and look like sign-in or a household. Doctor must say `setup-gate-missing-keys`.
- Partial or invalid keys open the checklist immediately (`shouldOpenBackendChecklist`). Do not treat that as the missing-keys CTA path.
- `.env.local` is gitignored and Next will load it. If a previous developer pointed it at a hosted project, stop and unset — do not drive that instance.
- Continue setup writes `sessionStorage` key `supper.setup-started`. A leftover tab from another run can already show the checklist; use a fresh profile if you need the CTA.
- House setup after a real local database (**Set up this house**, invite, nights, stores, Wake) is a later path. It is not this feature. Do not tap **Create this week's meals** against a hosted household.
- Wake / `BOT_WAKE` is required before a real house creates its first ballot. Verification does not create that webhook against production.
