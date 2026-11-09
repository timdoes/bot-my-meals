---- MODULE WeekLock ----
\* Ballot -> lock for one cooking week.
\* Nights 0 and 1; today is a house-local date index (2 = both nights past).
\* Each action is one step in the named code. Broken* constants remove a guard.

EXTENDS Integers, TLC

CONSTANTS
  BrokenLockGuard,     \* omit private.enforce_week_lock blocker test
  BrokenActionGuard,   \* omit dinnerNightActionsOpen
  BrokenMadeChip       \* cookingNightChip ignores past/covered

ASSUME BrokenLockGuard \in BOOLEAN
ASSUME BrokenActionGuard \in BOOLEAN
ASSUME BrokenMadeChip \in BOOLEAN

Nights == {0, 1}
Choices == {"none", "swap", "remove", "request_new_meal"}
Roles == {"owner", "voter", "eater"}

VARIABLES
  weekStatus,     \* weeks.status
  plannedFrom,    \* weeks.planned_from; -1 = null
  editableFrom,   \* weeks.editable_from after unlock; -1 = null
  today,          \* house-local date index; night n is past iff n < today
  latestChoice,   \* latestVoteForMeal / nightLifecycle per night
  recipeReady,    \* dinnerRecipeReady
  actorRole       \* session.role of the member who acts

vars == <<weekStatus, plannedFrom, editableFrom, today, latestChoice, recipeReady, actorRole>>

\* Code: src/lib/week-chrome.ts isPastDinnerNight / mealNightPhase
IsPast(n) == n < today

\* Code: src/lib/lock.ts canActOnBallot
CanActOnBallot == actorRole \in {"owner", "voter"}

\* Code: src/lib/week-chrome.ts nightStaysLocked
NightStaysLocked(n) ==
  IF weekStatus = "locked"
  THEN TRUE
  ELSE editableFrom # -1 /\ n < editableFrom

\* Code: src/lib/week-chrome.ts dinnerNightActionsOpen
DinnerNightActionsOpen(n) ==
  /\ ~IsPast(n)
  /\ ~NightStaysLocked(n)
  /\ CanActOnBallot

\* Code: src/lib/lock.ts checkWeekLock (meals with nightDate >= todayIso)
ClientBlocked ==
  \E n \in Nights: ~IsPast(n) /\ latestChoice[n] \in {"swap", "request_new_meal"}

\* Code: supabase/migrations/20260912205000_ballot_passive_lock.sql
\*       private.enforce_week_lock (every night on the week)
SqlBlocked ==
  \E n \in Nights: latestChoice[n] \in {"swap", "request_new_meal"}

\* Code: src/lib/week-chrome.ts nightCoveredByLock
Covered(n) ==
  IF plannedFrom # -1
  THEN n >= plannedFrom
  ELSE IF weekStatus = "locked"
       THEN TRUE
       ELSE editableFrom # -1

\* Code: src/lib/week-chrome.ts cookingNightChip
CookingNightChip(n) ==
  IF BrokenMadeChip
  THEN IF recipeReady[n] THEN "made" ELSE "no_recipe"
  ELSE IF ~IsPast(n)
       THEN "none"
       ELSE IF ~Covered(n)
            THEN "not_planned"
            ELSE IF latestChoice[n] = "remove"
                 THEN "none"
                 ELSE IF recipeReady[n] THEN "made" ELSE "no_recipe"

TypeOK ==
  /\ weekStatus \in {"voting", "locked"}
  /\ plannedFrom \in {-1, 0, 1, 2}
  /\ editableFrom \in {-1, 0, 1, 2}
  /\ today \in {0, 1, 2}
  /\ latestChoice \in [Nights -> Choices]
  /\ recipeReady \in [Nights -> BOOLEAN]
  /\ actorRole \in Roles

Init ==
  /\ weekStatus = "voting"
  /\ plannedFrom = -1
  /\ editableFrom = -1
  /\ today = 0
  /\ latestChoice = [n \in Nights |-> "none"]
  /\ recipeReady = [n \in Nights |-> FALSE]
  /\ actorRole = "owner"

\* Code: src/lib/supabase/repo.ts supabaseSetVote
\*       src/lib/lock.ts nightLifecycle (last writer wins)
SetVote(n, c) ==
  /\ c \in {"swap", "remove", "request_new_meal"}
  /\ CanActOnBallot
  /\ \/ BrokenActionGuard
     \/ DinnerNightActionsOpen(n)
  /\ latestChoice' = [latestChoice EXCEPT ![n] = c]
  /\ UNCHANGED <<weekStatus, plannedFrom, editableFrom, today, recipeReady, actorRole>>

\* Code: src/lib/supabase/repo.ts supabaseLockWeek -> public.lock_week
\*       trigger private.enforce_week_lock
\*       planned_from = coalesce(planned_from, today) in
\*       supabase/migrations/20261022120000_week_planned_from.sql
LockWeek ==
  /\ weekStatus = "voting"
  /\ \/ BrokenLockGuard
     \/ ~SqlBlocked
  /\ weekStatus' = "locked"
  /\ plannedFrom' = IF plannedFrom = -1 THEN today ELSE plannedFrom
  /\ UNCHANGED <<editableFrom, today, latestChoice, recipeReady, actorRole>>

\* Code: src/lib/supabase/repo.ts supabaseUnlockWeek (owner only)
UnlockWeek ==
  /\ weekStatus = "locked"
  /\ actorRole = "owner"
  /\ weekStatus' = "voting"
  /\ editableFrom' = today
  /\ UNCHANGED <<plannedFrom, today, latestChoice, recipeReady, actorRole>>

\* Code: src/lib/supabase/repo.ts supabaseProposeReplacement
ProposeReplacement(n) ==
  /\ latestChoice[n] \in {"swap", "request_new_meal"}
  /\ latestChoice' = [latestChoice EXCEPT ![n] = "none"]
  /\ recipeReady' = [recipeReady EXCEPT ![n] = TRUE]
  /\ UNCHANGED <<weekStatus, plannedFrom, editableFrom, today, actorRole>>

\* Code: bot fill of recipes.dinnerRecipeReady
FillRecipe(n) ==
  /\ recipeReady' = [recipeReady EXCEPT ![n] = TRUE]
  /\ UNCHANGED <<weekStatus, plannedFrom, editableFrom, today, latestChoice, actorRole>>

\* House-local calendar: a remaining night becomes past. Votes stay.
AdvanceToday ==
  /\ today < 2
  /\ today' = today + 1
  /\ UNCHANGED <<weekStatus, plannedFrom, editableFrom, latestChoice, recipeReady, actorRole>>

\* Code: another household member uses the PWA (session.role)
SwitchRole(r) ==
  /\ r \in Roles
  /\ actorRole' = r
  /\ UNCHANGED <<weekStatus, plannedFrom, editableFrom, today, latestChoice, recipeReady>>

Terminating == UNCHANGED vars

Next ==
  \/ \E n \in Nights, c \in {"swap", "remove", "request_new_meal"}: SetVote(n, c)
  \/ LockWeek
  \/ UnlockWeek
  \/ \E n \in Nights: ProposeReplacement(n)
  \/ \E n \in Nights: FillRecipe(n)
  \/ AdvanceToday
  \/ \E r \in Roles: SwitchRole(r)
  \/ Terminating

Spec == Init /\ [][Next]_vars

----
\* Property: a locked week has no open swap or dinner request.
\* Harm: the family cooks (or shops for) a night they asked to change.
NoLockWithOpenSwapOrRequest ==
  weekStatus = "locked" => ~SqlBlocked

\* Property: the Made chip appears only on a past night the first lock covered,
\* with a recipe, that was not removed.
\* Harm: a night that was never locked looks like it was cooked.
MadeChipOnlyWhenCovered ==
  \A n \in Nights:
    CookingNightChip(n) = "made" =>
      /\ IsPast(n)
      /\ Covered(n)
      /\ recipeReady[n]
      /\ latestChoice[n] # "remove"

\* Property: tonight/future never shows Made.
\* Harm: a dinner that has not happened yet is marked cooked.
MadeChipNotOnRest ==
  \A n \in Nights: ~IsPast(n) => CookingNightChip(n) # "made"

\* Property: first-lock planned_from does not move on later lock/unlock.
\* Harm: a past night flips between Made and Not planned after unlock + re-lock.
PlannedFromSticky ==
  [](\A v \in {0, 1, 2}: plannedFrom = v => [](plannedFrom = v))

\* Property: when remaining nights are clear, SQL can lock too.
\* FINDING on the real code: leftover swap on a past night — checkWeekLock(todayIso)
\* is ready, private.enforce_week_lock still raises.
\* Harm: Lock this week is shown, then the RPC fails; the week stays unlocked.
ClientReadyImpliesSqlCanLock ==
  ~ClientBlocked => ~SqlBlocked
====
