---- MODULE BotWake ----
\* Wake on app event: POST /api/bot/wake then postBotWake to the household webhook.
\* Two hosts stand in for two DIY households sharing one bot.
\* needs_work edge (shouldWakeNeedsWork) is out of this bound; see the skill.

EXTENDS Integers, TLC

CONSTANTS
  BrokenWakeAllowed,   \* POST week_locked even when the week is not locked
  BrokenDebounce,      \* skip the householdHost:event window
  BrokenCreateGuard    \* Create this week's meals without Wake your Bot

ASSUME BrokenWakeAllowed \in BOOLEAN
ASSUME BrokenDebounce \in BOOLEAN
ASSUME BrokenCreateGuard \in BOOLEAN

Hosts == {"house-a", "house-b"}
Events == {"week_locked", "check_now"}

VARIABLES
  configured,      \* BOT_WAKE_WEBHOOK_URL is an https webhook
  weekLocked,      \* supabaseCurrentWeekLocked per host
  used,            \* debounce store: this host:event already POSTed this window
  posted,          \* successful POSTs this window
  createdBallot,   \* requestWeekBallot succeeded
  bogusWeekLocked  \* posted week_locked while that host's week was not locked

vars == <<configured, weekLocked, used, posted, createdBallot, bogusWeekLocked>>

Zero == [h \in Hosts |-> [e \in Events |-> 0]]
Unused == [h \in Hosts |-> [e \in Events |-> FALSE]]

TypeOK ==
  /\ configured \in BOOLEAN
  /\ weekLocked \in [Hosts -> BOOLEAN]
  /\ used \in [Hosts -> [Events -> BOOLEAN]]
  /\ posted \in [Hosts -> [Events -> {0, 1, 2}]]
  /\ createdBallot \in [Hosts -> BOOLEAN]
  /\ bogusWeekLocked \in BOOLEAN

Init ==
  /\ configured = FALSE
  /\ weekLocked = [h \in Hosts |-> FALSE]
  /\ used = Unused
  /\ posted = Zero
  /\ createdBallot = [h \in Hosts |-> FALSE]
  /\ bogusWeekLocked = FALSE

\* Code: src/app/api/bot/wake/route.ts PUT + saveBotWakeSecrets
SaveWakeConfig ==
  /\ configured' = TRUE
  /\ UNCHANGED <<weekLocked, used, posted, createdBallot, bogusWeekLocked>>

\* Code: src/lib/bot-wake.ts wakeAllowed
WakeAllowed(h, e) ==
  CASE e = "check_now" -> TRUE
    [] e = "week_locked" -> weekLocked[h]
    [] OTHER -> FALSE

\* Code: src/app/api/bot/wake/route.ts POST
\*       src/lib/bot-wake.ts postBotWake + debounceKey(householdHost, event)
PostWake(h, e) ==
  /\ \/ BrokenWakeAllowed
     \/ WakeAllowed(h, e)
  /\ IF ~configured
     THEN UNCHANGED vars
     ELSE IF ~BrokenDebounce /\ used[h][e]
          THEN UNCHANGED vars
          ELSE /\ used' = [used EXCEPT ![h] = [used[h] EXCEPT ![e] = TRUE]]
               /\ posted' = [posted EXCEPT ![h] = [posted[h] EXCEPT ![e] = posted[h][e] + 1]]
               /\ bogusWeekLocked' =
                    IF e = "week_locked" /\ ~weekLocked[h] THEN TRUE ELSE bogusWeekLocked
               /\ UNCHANGED <<configured, weekLocked, createdBallot>>

\* Code: src/components/supper-provider.tsx requestWeekBallot
\*       FINISH_WAKE_BEFORE_CREATE when fetchBotWakeConfigured is false
CreateWeekBallot(h) ==
  /\ \/ BrokenCreateGuard
     \/ configured
  /\ createdBallot' = [createdBallot EXCEPT ![h] = TRUE]
  /\ UNCHANGED <<configured, weekLocked, used, posted, bogusWeekLocked>>

\* Code: src/lib/supabase/repo.ts supabaseLockWeek then requestBotWake("week_locked")
LockThisWeek(h) ==
  /\ weekLocked' = [weekLocked EXCEPT ![h] = TRUE]
  /\ UNCHANGED <<configured, used, posted, createdBallot, bogusWeekLocked>>

UnlockThisWeek(h) ==
  /\ weekLocked' = [weekLocked EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<configured, used, posted, createdBallot, bogusWeekLocked>>

\* Code: src/lib/bot-wake.ts BOT_WAKE_DEBOUNCE_MS window elapses
AdvanceWindow ==
  /\ used' = Unused
  /\ posted' = Zero
  /\ UNCHANGED <<configured, weekLocked, createdBallot, bogusWeekLocked>>

Terminating == UNCHANGED vars

Next ==
  \/ SaveWakeConfig
  \/ \E h \in Hosts, e \in Events: PostWake(h, e)
  \/ \E h \in Hosts: CreateWeekBallot(h)
  \/ \E h \in Hosts: LockThisWeek(h)
  \/ \E h \in Hosts: UnlockThisWeek(h)
  \/ AdvanceWindow
  \/ Terminating

Spec == Init /\ [][Next]_vars

----
\* Property: a week_locked webhook is sent only while that household's week is locked.
\* Harm: the bot writes recipes/list as if the week were locked when it is still a ballot.
WeekLockedPostImpliesLocked ==
  ~bogusWeekLocked

\* Property: no successful webhook POST until Wake your Bot is configured.
\* Harm: lock/create look like they woke the bot; nothing arrives.
NoPostUntilConfigured ==
  ~configured => \A h \in Hosts, e \in Events: posted[h][e] = 0

\* Property: at most one successful POST per household_host:event per debounce window.
\* Harm: the shared bot is flooded and may mix or skip household work.
AtMostOnePostPerWindow ==
  \A h \in Hosts, e \in Events: posted[h][e] <= 1

\* Property: Create this week's meals does not run before the webhook is saved.
\* Harm: a ballot is queued with no bot to fill it.
CreateRequiresWakeConfig ==
  \A h \in Hosts: createdBallot[h] => configured
====
