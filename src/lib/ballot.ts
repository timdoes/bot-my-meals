import { latestVoteForMeal, migrateVoteChoice } from "./lock";
import type { Meal, Membership, NightLifecycle, Vote, VoteChoice } from "./types";

/** Brief §6 — swap sheet */
export const SWAP_SHEET_TITLE = "Request a swap";
export const SWAP_SHEET_HELPER = "Optional — tell the meal bot what would work better.";
export const SWAP_SHEET_REASON_LABEL = "Reason";
export const SWAP_SHEET_PLACEHOLDER = "Too heavy. Want something faster.";
export const SWAP_SHEET_SEND = "Swap Meal";
export const SWAP_SHEET_CANCEL = "Cancel";
export const SWAP_REQUESTED = "Swap requested";

/** Brief §6 — remove confirm */
export const REMOVE_CONFIRM_TITLE = "Remove this dinner?";
export const REMOVE_CONFIRM_ACTION = "Remove dinner";
export const REMOVE_CONFIRM_KEEP = "Keep";
export function removeDinnerBody(dayLabel: string): string {
  return `${dayLabel} will have no meal. You can add one later.`;
}

/** Brief §6 — empty / pending / locked empty */
export const EMPTY_DAY_TITLE = "No dinner";
export const EMPTY_DAY_HELPER = "Nothing planned for this night.";
export const EMPTY_DAY_ADD = "Add meal";
export const ADD_SHEET_TITLE = "Request a new dinner";
export const ADD_SHEET_PEOPLE_LABEL = "People";
export const ADD_SHEET_NOTE_LABEL = "Note";
export const ADD_SHEET_PLACEHOLDER = "Something light. Kid-friendly.";
export const ADD_SHEET_SEND = "Request dinner";
export function addSheetHelper(dayLabel: string): string {
  return `We'll ask the meal bot for a proposal for ${dayLabel}.`;
}

/** Request dinner may persist that night's plate count. Swap and remove do not. */
export function voteSavesDinnerPeople(choice: VoteChoice): boolean {
  switch (choice) {
    case "request_new_meal":
      return true;
    case "swap":
    case "remove":
      return false;
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}
export const PENDING_ADD_TITLE = "Requesting dinner…";
export const PENDING_ADD_HELPER = "Waiting on a new proposal.";
export const PENDING_ADD_CANCEL = "Cancel request";
export const LOCKED_EMPTY_COPY = "Locked — no dinner this night.";

/** Empty This week — no canned seed. Finish setup, create meals, or wait for Bot. */
export const EMPTY_WEEK_TITLE = "No dinners yet";
export const EMPTY_WEEK_SETUP_HELPER =
  "Finish setting up this house, then create this week's meals.";
export const EMPTY_WEEK_SETUP_CTA = "Finish house setup";
export const EMPTY_WEEK_CREATE_HELPER =
  "Create this week's meals. Your Bot My Meals (Grok Bot) proposes dinners from this house's plates, stores, and budget.";
export const EMPTY_WEEK_CREATE_CTA = "Create this week's meals";
export const EMPTY_WEEK_WAITING_TITLE = "Waiting for your Bot…";
export const EMPTY_WEEK_WAITING_HELPER =
  "Your Bot is writing this week's dinners. This page updates when they land.";

export type EmptyWeekAction = "finish-setup" | "create-meals" | "waiting";

export function emptyWeekPresentation(input: {
  setupIncomplete: boolean;
  ballotStatus: "pending" | "fulfilled" | "cancelled" | null;
  canCreate: boolean;
}): {
  title: string;
  helper: string;
  cta: string;
  action: EmptyWeekAction;
} {
  if (input.setupIncomplete && input.canCreate) {
    return {
      title: EMPTY_WEEK_TITLE,
      helper: EMPTY_WEEK_SETUP_HELPER,
      cta: EMPTY_WEEK_SETUP_CTA,
      action: "finish-setup",
    };
  }
  if (input.ballotStatus === "pending" || !input.canCreate) {
    return {
      title: EMPTY_WEEK_WAITING_TITLE,
      helper: EMPTY_WEEK_WAITING_HELPER,
      cta: EMPTY_WEEK_WAITING_TITLE,
      action: "waiting",
    };
  }
  return {
    title: EMPTY_WEEK_TITLE,
    helper: EMPTY_WEEK_CREATE_HELPER,
    cta: EMPTY_WEEK_CREATE_CTA,
    action: "create-meals",
  };
}

export type WeekNightPresentation = "ballot" | "empty" | "pending_add" | "locked_empty";

/** Blank dinner slot the bot still has to fill. A remove vote stays “No dinner”. */
export function awaitingMealSlot(
  meal: Pick<Meal, "id" | "title">,
  votes: Vote[],
  memberships?: Membership[],
): boolean {
  if (meal.title.trim()) return false;
  const latest = latestVoteForMeal(votes, meal.id, memberships);
  const choice = latest ? migrateVoteChoice(latest.choice) : null;
  return choice !== "remove";
}

export function weekNightPresentation(
  lifecycle: NightLifecycle,
  locked: boolean,
): WeekNightPresentation {
  switch (lifecycle) {
    case "removed":
      return locked ? "locked_empty" : "empty";
    case "request_new_meal":
      return locked ? "locked_empty" : "pending_add";
    case "passive":
    case "swapped":
    case "proposed":
      return "ballot";
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

/** Swap and pending-add notes go to the meal bot. Remove never keeps a note. */
export function voteNotePersists(choice: VoteChoice): boolean {
  switch (choice) {
    case "swap":
    case "request_new_meal":
      return true;
    case "remove":
      return false;
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}

export function voteConfirmation(choice: VoteChoice | null | undefined): string | undefined {
  switch (choice) {
    case "swap":
      return "You want a swap";
    case "remove":
      return "You removed this night";
    case "request_new_meal":
      return "You asked for a new meal";
    case null:
    case undefined:
      return undefined;
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}

export function voteActionLabel(choice: VoteChoice, title: string): string {
  switch (choice) {
    case "swap":
      return `Swap ${title}`;
    case "remove":
      return `Remove ${title}`;
    case "request_new_meal":
      return `Request a new meal for ${title}`;
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}

export function isMutedBallotNight(input: { isLeftovers: boolean; isNightOff: boolean }): boolean {
  return input.isLeftovers || input.isNightOff;
}

/** Unvoted nights start expanded. After a vote, collapse unless the user opened the card again. */
export function ballotCardExpanded(hasVote: boolean, userOpened: boolean): boolean {
  return !hasVote || userOpened;
}
