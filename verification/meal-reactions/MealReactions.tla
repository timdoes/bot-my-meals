---- MODULE MealReactions ----
\* Thumbs up (saved_meals) and Never again (meal_dislikes.never_again) for one household.
\* DB triggers keep the two tables and pending ballot keys in step.

EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  BrokenNeverAgainTrigger,   \* skip private.block_meal_on_never_again
  BrokenFavoriteTrigger,     \* skip private.clear_never_again_for_favorite
  BrokenBallotStrip          \* skip private.strip_blocked_saved_keys

ASSUME BrokenNeverAgainTrigger \in BOOLEAN
ASSUME BrokenFavoriteTrigger \in BOOLEAN
ASSUME BrokenBallotStrip \in BOOLEAN

Keys == {"chili", "pasta"}

VARIABLES
  favorite,      \* saved_meals row for that recipe_key
  neverAgain,    \* meal_dislikes.never_again
  ballot         \* pending ballot_requests.saved_recipe_keys

vars == <<favorite, neverAgain, ballot>>

TypeOK ==
  /\ favorite \in [Keys -> BOOLEAN]
  /\ neverAgain \in [Keys -> BOOLEAN]
  /\ ballot \subseteq Keys

Init ==
  /\ favorite = [k \in Keys |-> FALSE]
  /\ neverAgain = [k \in Keys |-> FALSE]
  /\ ballot = {}

\* Code: src/lib/supabase/repo.ts supabaseUpsertMealDislike (neverAgain true)
\*       trigger private.block_meal_on_never_again (same transaction)
BlockNeverAgain(k) ==
  /\ neverAgain' = [neverAgain EXCEPT ![k] = TRUE]
  /\ favorite' = IF BrokenNeverAgainTrigger
                 THEN favorite
                 ELSE [favorite EXCEPT ![k] = FALSE]
  /\ ballot' = IF BrokenNeverAgainTrigger THEN ballot ELSE ballot \ {k}

\* Code: src/lib/meal-reactions.ts applyFavoriteAction
\*       saved_meals upsert + trigger private.clear_never_again_for_favorite
FavoriteMeal(k) ==
  /\ favorite' = [favorite EXCEPT ![k] = TRUE]
  /\ neverAgain' = IF BrokenFavoriteTrigger
                   THEN neverAgain
                   ELSE [neverAgain EXCEPT ![k] = FALSE]
  /\ UNCHANGED ballot

\* Code: src/lib/supabase/repo.ts supabaseAllowMealAgain
AllowAgain(k) ==
  /\ neverAgain' = [neverAgain EXCEPT ![k] = FALSE]
  /\ UNCHANGED <<favorite, ballot>>

\* Code: src/lib/supabase/repo.ts supabaseUpsertFavorite remove / applyFavoriteAction remove
RemoveFavorite(k) ==
  /\ favorite' = [favorite EXCEPT ![k] = FALSE]
  /\ UNCHANGED <<neverAgain, ballot>>

\* Code: pending ballot_requests write + private.strip_blocked_saved_keys
WriteBallot(ks) ==
  /\ ks \subseteq Keys
  /\ ballot' = IF BrokenBallotStrip
               THEN ks
               ELSE ks \ {k \in Keys: neverAgain[k]}
  /\ UNCHANGED <<favorite, neverAgain>>

Terminating == UNCHANGED vars

Next ==
  \/ \E k \in Keys: BlockNeverAgain(k)
  \/ \E k \in Keys: FavoriteMeal(k)
  \/ \E k \in Keys: AllowAgain(k)
  \/ \E k \in Keys: RemoveFavorite(k)
  \/ \E ks \in SUBSET Keys: WriteBallot(ks)
  \/ Terminating

Spec == Init /\ [][Next]_vars

----
\* Property: Never again and Favorite cannot both be on for the same recipe_key.
\* Harm: the bot puts a banned meal back on the ballot as a favorite.
NeverAgainExcludesFavorite ==
  \A k \in Keys: ~(neverAgain[k] /\ favorite[k])

\* Property: a pending ballot does not carry a Never-again key.
\* Harm: next week's ballot proposes a meal the house banned.
BallotOmitsNeverAgain ==
  \A k \in Keys: k \in ballot => ~neverAgain[k]
====
