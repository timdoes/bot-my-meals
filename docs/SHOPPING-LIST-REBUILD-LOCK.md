# Shopping list rebuild after a dinner change (Tim lock 2026-10-04)

**Status:** UX LOCK. This file is the lock. It is not the implementation.

**Ship:** public `timdoes/bot-my-meals` first, then every hosted app. No new database per house.

**Do not wake the bot.** The list updates from the dinners already on the week.

**Companion:** `INSTANT-FEEDBACK-LOCK.md`. A checkbox is still optimistic. Do not put a spinner on the checkbox. Do not clear every check and rebuild the list as new.

---

## When

The shopping list for **that week** rebuilds after one of these on a night in that week:

- Remove a dinner
- Swap a dinner
- Servings change
- A new dinner lands on a night

The other week’s list does not change. If that week has no shopping list yet, do not invent one and do not wake the bot.

---

## What changes

Match a line by its item in its store section, not by the amount.

| Line | Check |
|------|--------|
| Same item, same amount | Stays as it was. A checked line stays checked |
| Same item, amount changed | Stays on the list. It **unchecks** |
| Item no longer needed | Drops off |
| New item | Comes in **unchecked** |

Only those lines move. Do not reorder the whole list for its own sake. Do not invent prices. Do not claim a store cart add.

No new sentence on the list. No confirm. The rows update in place.

---

## Out

- No bot wake
- No full-list uncheck
- No spinner on a checkbox
- No change to the other week, House defaults, or stores

---

## Acceptance

- [ ] Remove, swap, servings, or a new dinner updates only the affected lines
- [ ] A checked line with the same amount stays checked
- [ ] A checked line whose amount changed is unchecked
- [ ] New lines arrive unchecked
- [ ] Gone lines drop off
- [ ] The bot is not woken
- [ ] Public repo first, then every hosted app

---

*Lock of record: after a dinner change, the shopping list rebuilds in place. Same amount keeps its check. A changed amount unchecks. New lines are unchecked. Removed lines drop. No bot wake.*
