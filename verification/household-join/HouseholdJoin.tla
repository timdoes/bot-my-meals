---- MODULE HouseholdJoin ----
\* Membership, join links, pending email invites, and last-admin protection.
\* claim_join_token refuses a second house; claim_pending_invites and
\* join_household_by_code do not.

EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  BrokenOneHouse,     \* claim_join_token skips "already in a house"
  BrokenLastOwner,    \* skip private.protect_last_owner
  BrokenTokenGuard    \* claim a used/expired/invalid token

ASSUME BrokenOneHouse \in BOOLEAN
ASSUME BrokenLastOwner \in BOOLEAN
ASSUME BrokenTokenGuard \in BOOLEAN

Users == {"u1", "u2"}
Houses == {"a", "b"}
TokenStates == {"ok", "expired", "used", "invalid"}
Roles == {"owner", "voter"}

VARIABLES
  signedIn,
  houses,
  role,
  token,
  pending,
  joinedOnBadToken

vars == <<signedIn, houses, role, token, pending, joinedOnBadToken>>

TypeOK ==
  /\ signedIn \in [Users -> BOOLEAN]
  /\ houses \in [Users -> SUBSET Houses]
  /\ role \in [Users -> [Houses -> Roles \cup {"none"}]]
  /\ token \in [Houses -> TokenStates]
  /\ pending \in [Users -> SUBSET Houses]
  /\ joinedOnBadToken \in BOOLEAN
  /\ \A u \in Users, h \in Houses:
       (h \in houses[u]) <=> (role[u][h] # "none")

Init ==
  /\ signedIn = [u \in Users |-> TRUE]
  /\ houses = [u \in Users |-> IF u = "u1" THEN {"a"} ELSE {}]
  /\ role = [u \in Users |-> [h \in Houses |-> IF u = "u1" /\ h = "a" THEN "owner" ELSE "none"]]
  /\ token = [h \in Houses |-> "ok"]
  /\ pending = [u \in Users |-> {}]
  /\ joinedOnBadToken = FALSE

InHouse(u, h) == h \in houses[u]
OwnerCount(h) == Cardinality({u \in Users: role[u][h] = "owner"})
Occupied(h) == \E u \in Users: InHouse(u, h)

\* Code: public.create_household
\*       (returns existing household if the user already has a membership)
CreateHousehold(u) ==
  /\ signedIn[u]
  /\ houses[u] = {}
  /\ \E h \in Houses:
       /\ ~Occupied(h)
       /\ houses' = [houses EXCEPT ![u] = {h}]
       /\ role' = [role EXCEPT ![u] = [role[u] EXCEPT ![h] = "owner"]]
  /\ UNCHANGED <<signedIn, token, pending, joinedOnBadToken>>

\* Code: public.peek_join_token / public.claim_join_token
\*       src/lib/supabase/repo.ts supabaseClaimJoinToken
ClaimJoinToken(u, h) ==
  /\ signedIn[u]
  /\ Occupied(h)
  /\ \/ BrokenTokenGuard
     \/ token[h] = "ok"
  /\ IF InHouse(u, h)
     THEN UNCHANGED vars
     ELSE /\ \/ BrokenOneHouse
            \/ houses[u] = {}
          /\ houses' = [houses EXCEPT ![u] = houses[u] \cup {h}]
          /\ role' = [role EXCEPT ![u] = [role[u] EXCEPT ![h] = "voter"]]
          /\ pending' = [pending EXCEPT ![u] = pending[u] \ {h}]
          /\ joinedOnBadToken' = IF token[h] # "ok" THEN TRUE ELSE joinedOnBadToken
          /\ UNCHANGED <<signedIn, token>>

\* Code: public.claim_pending_invites
\*       src/lib/supabase/repo.ts fetchSupabaseSession (always, before SELECT membership)
ClaimPendingInvites(u) ==
  /\ signedIn[u]
  /\ pending[u] # {}
  /\ houses' = [houses EXCEPT ![u] = houses[u] \cup pending[u]]
  /\ role' = [role EXCEPT ![u] = [h \in Houses |->
        IF h \in pending[u] /\ role[u][h] = "none" THEN "voter" ELSE role[u][h]]]
  /\ pending' = [pending EXCEPT ![u] = {}]
  /\ UNCHANGED <<signedIn, token, joinedOnBadToken>>

\* Code: public.join_household_by_code
\*       src/lib/supabase/repo.ts supabaseJoinByCode
JoinByCode(u, h) ==
  /\ signedIn[u]
  /\ Occupied(h)
  /\ ~InHouse(u, h)
  /\ houses' = [houses EXCEPT ![u] = houses[u] \cup {h}]
  /\ role' = [role EXCEPT ![u] = [role[u] EXCEPT ![h] = "voter"]]
  /\ pending' = [pending EXCEPT ![u] = pending[u] \ {h}]
  /\ UNCHANGED <<signedIn, token, joinedOnBadToken>>

\* Code: src/lib/supabase/repo.ts supabaseInviteMember
Invite(actor, u, h) ==
  /\ signedIn[actor]
  /\ role[actor][h] = "owner"
  /\ pending' = [pending EXCEPT ![u] = pending[u] \cup {h}]
  /\ UNCHANGED <<signedIn, houses, role, token, joinedOnBadToken>>

\* Code: public.set_member_role + private.protect_last_owner
SetMemberRole(actor, target, h, nextRole) ==
  /\ signedIn[actor]
  /\ role[actor][h] = "owner"
  /\ InHouse(target, h)
  /\ nextRole \in Roles
  /\ \/ BrokenLastOwner
     \/ nextRole = "owner"
     \/ role[target][h] # "owner"
     \/ OwnerCount(h) > 1
  /\ role' = [role EXCEPT ![target] = [role[target] EXCEPT ![h] = nextRole]]
  /\ UNCHANGED <<signedIn, houses, token, pending, joinedOnBadToken>>

\* Code: public.remove_member + private.protect_last_owner
RemoveMember(actor, target, h) ==
  /\ signedIn[actor]
  /\ role[actor][h] = "owner"
  /\ InHouse(target, h)
  /\ \/ BrokenLastOwner
     \/ role[target][h] # "owner"
     \/ OwnerCount(h) > 1
  /\ houses' = [houses EXCEPT ![target] = houses[target] \ {h}]
  /\ role' = [role EXCEPT ![target] = [role[target] EXCEPT ![h] = "none"]]
  /\ UNCHANGED <<signedIn, token, pending, joinedOnBadToken>>

\* Code: public.peek_join_token expired / used (rotate)
ExpireToken(h) ==
  /\ token' = [token EXCEPT ![h] = "expired"]
  /\ UNCHANGED <<signedIn, houses, role, pending, joinedOnBadToken>>

RevokeToken(h) ==
  /\ token' = [token EXCEPT ![h] = "used"]
  /\ UNCHANGED <<signedIn, houses, role, pending, joinedOnBadToken>>

SignOut(u) ==
  /\ signedIn' = [signedIn EXCEPT ![u] = FALSE]
  /\ UNCHANGED <<houses, role, token, pending, joinedOnBadToken>>

SignIn(u) ==
  /\ signedIn' = [signedIn EXCEPT ![u] = TRUE]
  /\ UNCHANGED <<houses, role, token, pending, joinedOnBadToken>>

Terminating == UNCHANGED vars

Next ==
  \/ \E u \in Users: CreateHousehold(u)
  \/ \E u \in Users, h \in Houses: ClaimJoinToken(u, h)
  \/ \E u \in Users: ClaimPendingInvites(u)
  \/ \E u \in Users, h \in Houses: JoinByCode(u, h)
  \/ \E actor \in Users, u \in Users, h \in Houses: Invite(actor, u, h)
  \/ \E actor \in Users, target \in Users, h \in Houses, r \in Roles:
       SetMemberRole(actor, target, h, r)
  \/ \E actor \in Users, target \in Users, h \in Houses: RemoveMember(actor, target, h)
  \/ \E h \in Houses: ExpireToken(h)
  \/ \E h \in Houses: RevokeToken(h)
  \/ \E u \in Users: SignOut(u)
  \/ \E u \in Users: SignIn(u)
  \/ Terminating

Spec == Init /\ [][Next]_vars

----
\* Property: a house with members always keeps an Admin.
\* Harm: nobody can unlock, invite, or save the bot webhook.
LastOwnerRemains ==
  \A h \in Houses: Occupied(h) => OwnerCount(h) >= 1

\* Property: a used, expired, or invalid join link does not add a new member.
\* Harm: a rotated or old link still adds someone to the house.
BadTokenDoesNotJoin ==
  ~joinedOnBadToken

\* Property the product copy promises: one person, one household.
\* FINDING: claim_pending_invites and join_household_by_code can add a second house.
\* Harm: fetchSupabaseSession keeps the oldest membership; the other house is hidden.
AtMostOneHouse ==
  \A u \in Users: Cardinality(houses[u]) <= 1
====
