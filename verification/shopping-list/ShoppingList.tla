---- MODULE ShoppingList ----
\* Shopping list create at lock and in-place rebuild after lock.
\* Cooking and planning are separate weeks. Broken* constants remove a guard.

EXTENDS Integers, TLC

CONSTANTS
  BrokenRedact,     \* show the list before the week is locked
  BrokenRebuild,    \* rebuild unchecks every surviving line
  BrokenCreate      \* rebuild invents a list on a voting week

ASSUME BrokenRedact \in BOOLEAN
ASSUME BrokenRebuild \in BOOLEAN
ASSUME BrokenCreate \in BOOLEAN

Weeks == {"cooking", "planning"}
Items == {"milk"}
Qtys == {0, 1}

VARIABLES
  status,        \* weeks.status per week
  listExists,    \* shopping_lists row for that week_id
  desired,       \* dinnerShoppingLines / private.week_shopping_lines
  onList,        \* shopping_items.quantity; 0 means the line is absent
  checked,       \* shopping_items.checked
  stableCheck    \* user checked a line whose amount has not drifted since

vars == <<status, listExists, desired, onList, checked, stableCheck>>

ZeroItems == [i \in Items |-> 0]
NoChecks == [i \in Items |-> FALSE]

TypeOK ==
  /\ status \in [Weeks -> {"voting", "locked"}]
  /\ listExists \in [Weeks -> BOOLEAN]
  /\ desired \in [Weeks -> [Items -> Qtys]]
  /\ onList \in [Weeks -> [Items -> Qtys]]
  /\ checked \in [Weeks -> [Items -> BOOLEAN]]
  /\ stableCheck \in [Weeks -> [Items -> BOOLEAN]]

Init ==
  /\ status = [w \in Weeks |-> "voting"]
  /\ listExists = [w \in Weeks |-> FALSE]
  /\ desired = [w \in Weeks |-> [i \in Items |-> IF w = "cooking" THEN 1 ELSE 0]]
  /\ onList = [w \in Weeks |-> ZeroItems]
  /\ checked = [w \in Weeks |-> NoChecks]
  /\ stableCheck = [w \in Weeks |-> NoChecks]

\* Code: src/lib/visibility.ts redactUntilLocked
DisplayList(w) ==
  IF BrokenRedact
  THEN listExists[w]
  ELSE status[w] = "locked" /\ listExists[w]

\* Code: src/lib/supabase/repo.ts supabaseLockWeek -> public.lock_week
\*       DELETE shopping_lists for week_id, INSERT list + items (unchecked)
LockWeek(w) ==
  /\ status[w] = "voting"
  /\ status' = [status EXCEPT ![w] = "locked"]
  /\ listExists' = [listExists EXCEPT ![w] = TRUE]
  /\ onList' = [onList EXCEPT ![w] = desired[w]]
  /\ checked' = [checked EXCEPT ![w] = NoChecks]
  /\ stableCheck' = [stableCheck EXCEPT ![w] = NoChecks]
  /\ UNCHANGED desired

\* Code: src/lib/supabase/repo.ts supabaseUnlockWeek
\*       1) UPDATE weeks.status = voting  2) DELETE shopping_lists
\*       Two statements; not one transaction.
UnlockStatus(w) ==
  /\ status[w] = "locked"
  /\ status' = [status EXCEPT ![w] = "voting"]
  /\ UNCHANGED <<listExists, desired, onList, checked, stableCheck>>

DeleteList(w) ==
  /\ status[w] = "voting"
  /\ listExists[w]
  /\ listExists' = [listExists EXCEPT ![w] = FALSE]
  /\ onList' = [onList EXCEPT ![w] = ZeroItems]
  /\ checked' = [checked EXCEPT ![w] = NoChecks]
  /\ stableCheck' = [stableCheck EXCEPT ![w] = NoChecks]
  /\ UNCHANGED <<status, desired>>

\* Code: src/lib/shopping.ts reconcileShoppingItems
\*       public.rebuild_week_shopping_list
\* Same store+name+unit and same quantity keeps checked; a changed amount unchecks.
Rebuild(w) ==
  /\ IF ~listExists[w]
     THEN IF BrokenCreate
          THEN /\ listExists' = [listExists EXCEPT ![w] = TRUE]
               /\ onList' = [onList EXCEPT ![w] = desired[w]]
               /\ checked' = [checked EXCEPT ![w] = NoChecks]
               /\ stableCheck' = [stableCheck EXCEPT ![w] = NoChecks]
               /\ UNCHANGED <<status, desired>>
          ELSE UNCHANGED vars
     ELSE
       /\ onList' = [onList EXCEPT ![w] = desired[w]]
       /\ checked' = [checked EXCEPT ![w] = [i \in Items |->
            IF desired[w][i] = 0
            THEN FALSE
            ELSE IF BrokenRebuild
                 THEN FALSE
                 ELSE IF desired[w][i] = onList[w][i]
                      THEN checked[w][i]
                      ELSE FALSE]]
       /\ stableCheck' = [stableCheck EXCEPT ![w] = [i \in Items |->
            IF desired[w][i] = 0
            THEN FALSE
            ELSE IF BrokenRebuild
                 THEN stableCheck[w][i]
                 ELSE IF desired[w][i] = onList[w][i]
                      THEN stableCheck[w][i]
                      ELSE FALSE]]
       /\ UNCHANGED <<status, listExists, desired>>

\* Code: src/lib/supabase/repo.ts supabaseToggleItem
ToggleItem(w, i) ==
  /\ listExists[w]
  /\ onList[w][i] # 0
  /\ checked' = [checked EXCEPT ![w] = [checked[w] EXCEPT ![i] = ~checked[w][i]]]
  /\ stableCheck' = [stableCheck EXCEPT ![w] = [stableCheck[w] EXCEPT ![i] =
        IF ~checked[w][i] /\ desired[w][i] = onList[w][i] THEN TRUE ELSE FALSE]]
  /\ UNCHANGED <<status, listExists, desired, onList>>

\* Code: recipe / vote / serving drift that changes dinnerShoppingLines
ChangeDesired(w, i, q) ==
  /\ q \in Qtys
  /\ desired' = [desired EXCEPT ![w] = [desired[w] EXCEPT ![i] = q]]
  /\ stableCheck' = [stableCheck EXCEPT ![w] = [stableCheck[w] EXCEPT ![i] =
        IF q = onList[w][i] /\ q # 0 THEN stableCheck[w][i] ELSE FALSE]]
  /\ UNCHANGED <<status, listExists, onList, checked>>

Terminating == UNCHANGED vars

Next ==
  \/ \E w \in Weeks: LockWeek(w)
  \/ \E w \in Weeks: UnlockStatus(w)
  \/ \E w \in Weeks: DeleteList(w)
  \/ \E w \in Weeks: Rebuild(w)
  \/ \E w \in Weeks, i \in Items: ToggleItem(w, i)
  \/ \E w \in Weeks, i \in Items, q \in Qtys: ChangeDesired(w, i, q)
  \/ Terminating

Spec == Init /\ [][Next]_vars

----
\* Property: the shopping list is not shown until that week is locked.
\* Harm: the family shops before dinners are locked, then the list is replaced.
NoListShownUntilLocked ==
  \A w \in Weeks: DisplayList(w) => status[w] = "locked"

\* Property: a shopping_lists row exists only while that week is locked.
\* FINDING on the real code: supabaseUnlockWeek updates weeks then deletes the list
\* in a second statement, so a voting week can still have a list.
\* Harm: rebuild_week_shopping_list can mutate groceries after unlock, before delete.
ListOnlyWhenLocked ==
  \A w \in Weeks: listExists[w] => status[w] = "locked"

\* Property: a checked line whose amount did not change stays checked across rebuild.
\* Harm: already-bought groceries get unchecked and bought again.
StableChecksSurviveRebuild ==
  \A w \in Weeks, i \in Items: stableCheck[w][i] => checked[w][i]

\* Property: cooking and planning lists do not share rows.
\* Harm: checking milk for this week clears it on next week.
\* Encoded as: a toggle/rebuild/lock of one week never appears in Next as a write of both.
\* The actions above already take one week; this invariant catches BrokenCreate-style mixups
\* by requiring each week's checked lines to exist on that week's list only.
ChecksBelongToTheirList ==
  \A w \in Weeks, i \in Items: checked[w][i] => onList[w][i] # 0
====
