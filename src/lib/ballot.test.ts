import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VoteChoice } from "./types";
import {
  ADD_SHEET_PEOPLE_LABEL,
  ADD_SHEET_PLACEHOLDER,
  ADD_SHEET_SEND,
  ADD_SHEET_TITLE,
  EMPTY_DAY_ADD,
  EMPTY_DAY_HELPER,
  EMPTY_DAY_TITLE,
  EMPTY_WEEK_CREATE_CTA,
  EMPTY_WEEK_CREATE_HELPER,
  EMPTY_WEEK_SETUP_CTA,
  EMPTY_WEEK_SETUP_HELPER,
  EMPTY_WEEK_TITLE,
  EMPTY_WEEK_WAITING_HELPER,
  EMPTY_WEEK_WAITING_TITLE,
  emptyWeekPresentation,
  LOCKED_EMPTY_COPY,
  PENDING_ADD_CANCEL,
  PENDING_ADD_HELPER,
  PENDING_ADD_TITLE,
  REMOVE_CONFIRM_ACTION,
  REMOVE_CONFIRM_KEEP,
  REMOVE_CONFIRM_TITLE,
  SWAP_REQUESTED,
  SWAP_SHEET_HELPER,
  SWAP_SHEET_PLACEHOLDER,
  SWAP_SHEET_SEND,
  SWAP_SHEET_TITLE,
  addSheetHelper,
  ballotCardExpanded,
  isMutedBallotNight,
  removeDinnerBody,
  voteActionLabel,
  voteConfirmation,
  voteNotePersists,
  voteSavesDinnerPeople,
  weekNightPresentation,
} from "./ballot";

describe("voteConfirmation", () => {
  it("uses swap / remove / pending-add phrases and never coaches collapse", () => {
    expect(voteConfirmation("swap")).toBe("You want a swap");
    expect(voteConfirmation("remove")).toBe("You removed this night");
    expect(voteConfirmation("request_new_meal")).toBe("You asked for a new meal");
    expect(voteConfirmation(null)).toBeUndefined();
    expect(voteConfirmation(undefined)).toBeUndefined();

    const phrases = (["swap", "remove", "request_new_meal"] as VoteChoice[]).map((choice) =>
      voteConfirmation(choice),
    );
    expect(JSON.stringify(phrases).toLowerCase()).not.toContain("tap to collapse");
    expect(JSON.stringify(phrases).toLowerCase()).not.toContain("tap to expand");
    expect(JSON.stringify(phrases).toLowerCase()).not.toContain("approve");
    expect(JSON.stringify(phrases).toLowerCase()).not.toContain("skip");
  });
});

describe("voteActionLabel", () => {
  it("names the night in each vote aria-label", () => {
    expect(voteActionLabel("swap", "Miso butter noodles")).toBe("Swap Miso butter noodles");
    expect(voteActionLabel("remove", "Black bean tacos")).toBe("Remove Black bean tacos");
    expect(voteActionLabel("request_new_meal", "Friday")).toBe("Request a new meal for Friday");
  });
});

describe("muted ballot nights", () => {
  it("uses one treatment for leftovers and night-off", () => {
    expect(isMutedBallotNight({ isLeftovers: true, isNightOff: false })).toBe(true);
    expect(isMutedBallotNight({ isLeftovers: false, isNightOff: true })).toBe(true);
    expect(isMutedBallotNight({ isLeftovers: true, isNightOff: true })).toBe(true);
    expect(isMutedBallotNight({ isLeftovers: false, isNightOff: false })).toBe(false);
  });
});

describe("ballot expand", () => {
  it("expands unvoted nights and collapses after a vote until opened again", () => {
    expect(ballotCardExpanded(false, false)).toBe(true);
    expect(ballotCardExpanded(true, false)).toBe(false);
    expect(ballotCardExpanded(true, true)).toBe(true);
    expect(ballotCardExpanded(false, true)).toBe(true);
  });
});

describe("week night presentation", () => {
  it("maps lifecycle to Ballot-2 card kinds", () => {
    expect(weekNightPresentation("passive", false)).toBe("ballot");
    expect(weekNightPresentation("swapped", false)).toBe("ballot");
    expect(weekNightPresentation("proposed", false)).toBe("ballot");
    expect(weekNightPresentation("removed", false)).toBe("empty");
    expect(weekNightPresentation("removed", true)).toBe("locked_empty");
    expect(weekNightPresentation("request_new_meal", false)).toBe("pending_add");
    expect(weekNightPresentation("request_new_meal", true)).toBe("locked_empty");
  });
});

describe("Ballot-2 microcopy", () => {
  it("uses brief §6 phrases and persists notes on swap / pending add", () => {
    expect(SWAP_SHEET_TITLE).toBe("Request a swap");
    expect(SWAP_SHEET_HELPER).toBe("Optional — tell the meal bot what would work better.");
    expect(SWAP_SHEET_PLACEHOLDER).toBe("Too heavy. Want something faster.");
    expect(SWAP_SHEET_SEND).toBe("Swap Meal");
    expect(SWAP_REQUESTED).toBe("Swap requested");
    expect(REMOVE_CONFIRM_TITLE).toBe("Remove this dinner?");
    expect(REMOVE_CONFIRM_ACTION).toBe("Remove dinner");
    expect(REMOVE_CONFIRM_KEEP).toBe("Keep");
    expect(removeDinnerBody("Wednesday")).toBe(
      "Wednesday will have no meal. You can add one later.",
    );
    expect(EMPTY_DAY_TITLE).toBe("No dinner");
    expect(EMPTY_DAY_HELPER).toBe("Nothing planned for this night.");
    expect(EMPTY_DAY_ADD).toBe("Add meal");
    expect(ADD_SHEET_TITLE).toBe("Request a new dinner");
    expect(addSheetHelper("Monday")).toBe("We'll ask the meal bot for a proposal for Monday.");
    expect(ADD_SHEET_PEOPLE_LABEL).toBe("People");
    expect(ADD_SHEET_PLACEHOLDER).toBe("Something light. Kid-friendly.");
    expect(ADD_SHEET_SEND).toBe("Request dinner");
    expect(voteSavesDinnerPeople("request_new_meal")).toBe(true);
    expect(voteSavesDinnerPeople("swap")).toBe(false);
    expect(voteSavesDinnerPeople("remove")).toBe(false);
    expect(PENDING_ADD_TITLE).toBe("Requesting dinner…");
    expect(PENDING_ADD_HELPER).toBe("Waiting on a new proposal.");
    expect(PENDING_ADD_CANCEL).toBe("Cancel request");
    expect(LOCKED_EMPTY_COPY).toBe("Locked — no dinner this night.");
    expect(EMPTY_WEEK_TITLE).toBe("No dinners yet");
    expect(
      emptyWeekPresentation({ setupIncomplete: true, ballotStatus: null, canCreate: true }),
    ).toEqual({
      title: EMPTY_WEEK_TITLE,
      helper: EMPTY_WEEK_SETUP_HELPER,
      cta: EMPTY_WEEK_SETUP_CTA,
      action: "finish-setup",
    });
    expect(
      emptyWeekPresentation({ setupIncomplete: false, ballotStatus: null, canCreate: true }),
    ).toEqual({
      title: EMPTY_WEEK_TITLE,
      helper: EMPTY_WEEK_CREATE_HELPER,
      cta: EMPTY_WEEK_CREATE_CTA,
      action: "create-meals",
    });
    expect(
      emptyWeekPresentation({ setupIncomplete: false, ballotStatus: "pending", canCreate: true }),
    ).toEqual({
      title: EMPTY_WEEK_WAITING_TITLE,
      helper: EMPTY_WEEK_WAITING_HELPER,
      cta: EMPTY_WEEK_WAITING_TITLE,
      action: "waiting",
    });
    expect(
      emptyWeekPresentation({ setupIncomplete: false, ballotStatus: null, canCreate: false }),
    ).toEqual({
      title: EMPTY_WEEK_WAITING_TITLE,
      helper: EMPTY_WEEK_WAITING_HELPER,
      cta: EMPTY_WEEK_WAITING_TITLE,
      action: "waiting",
    });
    expect(EMPTY_WEEK_SETUP_CTA).toBe("Finish house setup");
    expect(EMPTY_WEEK_CREATE_CTA).toBe("Create this week's meals");
    expect(EMPTY_WEEK_WAITING_TITLE).toBe("Waiting for your Bot…");
    expect(EMPTY_WEEK_CREATE_HELPER).toMatch(/Grok Bot/);
    expect(EMPTY_WEEK_SETUP_HELPER.toLowerCase()).not.toContain("open house");
    expect(EMPTY_WEEK_CREATE_HELPER.toLowerCase()).not.toContain("open house");
    expect(EMPTY_WEEK_CREATE_HELPER.toLowerCase()).not.toContain("seed");
    expect(EMPTY_WEEK_CREATE_HELPER.toLowerCase()).not.toContain("roast chicken");
    expect(EMPTY_WEEK_CREATE_HELPER.toLowerCase()).not.toContain("cart");
    expect(EMPTY_WEEK_CREATE_HELPER).not.toContain("$");
    expect(EMPTY_WEEK_WAITING_HELPER.toLowerCase()).not.toContain("seed");
    expect(EMPTY_WEEK_WAITING_HELPER).not.toContain("$");
    expect(voteNotePersists("swap")).toBe(true);
    expect(voteNotePersists("request_new_meal")).toBe(true);
    expect(voteNotePersists("remove")).toBe(false);
  });
});

describe("Clear Sky ballot craft", () => {
  it("ships Swap / Remove cards, sheets, and EmptyDayCard on semantic tokens", () => {
    const card = readFileSync(
      path.resolve(import.meta.dirname, "../components/ballot-card.tsx"),
      "utf8",
    );
    const empty = readFileSync(
      path.resolve(import.meta.dirname, "../components/empty-day-card.tsx"),
      "utf8",
    );
    const week = readFileSync(path.resolve(import.meta.dirname, "../app/week/page.tsx"), "utf8");
    const button = readFileSync(
      path.resolve(import.meta.dirname, "../components/ui/button.tsx"),
      "utf8",
    );
    expect(card).toContain("RefreshCw");
    expect(card).toContain("CircleMinus");
    expect(card).toContain("size-5 shrink-0");
    expect(card).toMatch(/size="vote"[\s\S]*?className="gap-2"[\s\S]*?Swap/);
    expect(card).toMatch(/size="vote"[\s\S]*?className="gap-2"[\s\S]*?Remove/);
    expect(card).toMatch(/>\s*Swap\s*</);
    expect(card).toMatch(/>\s*Remove\s*</);
    expect(card).toContain('data-slot="meal-day-label"');
    expect(card).toContain("type-day-label");
    expect(empty).toContain('data-slot="meal-day-label"');
    expect(week).toContain("formatMealCardDayLabel");
    expect(card).toContain("SWAP_SHEET_TITLE");
    expect(card).toContain("SWAP_SHEET_SEND");
    expect(card).toContain('className="flex-row gap-2"');
    expect(card).toContain("min-h-16 max-h-32 overflow-y-auto");
    expect(card).toContain('variant={swapped ? "swap" : "outline"}');
    expect(card).toMatch(/SheetFooter[\s\S]*?variant="outline"[\s\S]*?SWAP_SHEET_CANCEL[\s\S]*?variant="primary"[\s\S]*?SWAP_SHEET_SEND/);
    expect(card).not.toContain("Send swap");
    expect(card).not.toMatch(/SheetFooter[\s\S]*variant="swap"/);
    expect(empty).toContain('className="flex-row gap-2"');
    expect(empty).toMatch(/SheetFooter[\s\S]*?variant="outline"[\s\S]*?SWAP_SHEET_CANCEL[\s\S]*?variant="primary"[\s\S]*?ADD_SHEET_SEND/);
    expect(empty).not.toMatch(/SheetFooter[\s\S]*variant="swap"/);
    expect(card).toContain("SWAP_REQUESTED");
    expect(card).toContain("REMOVE_CONFIRM_TITLE");
    expect(card).toContain("REMOVE_CONFIRM_ACTION");
    expect(card).toContain("REMOVE_CONFIRM_KEEP");
    expect(card).toContain("rounded-t-[16px]");
    expect(empty).toContain("PENDING_ADD_HELPER");
    expect(empty).toContain("border-dashed");
    expect(empty).toContain('variant="link"');
    expect(empty).toContain("rounded-t-[16px]");
    expect(card).not.toContain("You approved");
    expect(card).not.toContain("Approve");
    expect(card).not.toContain('choice: "skip"');
    expect(empty).toContain("EMPTY_DAY_ADD");
    expect(empty).toMatch(
      /variant="outline"[\s\S]*?className="mt-4 w-full gap-2"[\s\S]*?<Plus className="size-5" \/>[\s\S]*?EMPTY_DAY_ADD/,
    );
    expect(empty).not.toMatch(/variant="primary"[\s\S]{0,180}EMPTY_DAY_ADD/);
    expect(empty).not.toMatch(/EMPTY_DAY_ADD[\s\S]{0,80}shadow-float/);
    expect(empty).toContain("LOCKED_EMPTY_COPY");
    expect(empty).toContain("PENDING_ADD_TITLE");
    expect(week).toContain("status={undefined}");
    expect(week).toContain("EmptyDayCard");
    expect(week).toContain("BallotToast");
    expect(week).toContain("emptyWeekPresentation");
    expect(week).toContain("requestWeekBallot");
    expect(week).toContain("waiting-for-bot");
    expect(week).toContain("isHouseSetupComplete");
    expect(week).toContain("isAdmin");
    expect(week).toContain('href="/week?setup=1"');
    expect(week).not.toContain("EMPTY_WEEK_CTA");
    expect(week).not.toContain("EMPTY_WEEK_ASK_PROMPT");
    expect(week).not.toContain('href="/settings"');
    expect(week).not.toContain("Open House");
    expect(week).not.toContain("Seed this week");
    expect(week).not.toContain("seedDemoWeek");
    expect(week).not.toContain("roast chicken");
    expect(week).not.toContain("StatusStrip");
    expect(week).not.toContain("Your vote needed");
    expect(week).not.toContain("You approved");
    expect(button).toContain("bg-approve text-approve-foreground");
    expect(button).toContain("bg-swap text-swap-foreground");
    expect(card).not.toContain("#b35025");
    expect(card).not.toContain("Fraunces");
    expect(card).not.toContain("Clear Sky");
    expect(card).not.toContain("Blue & White");
    expect(empty).not.toContain("#b35025");
    expect(empty).not.toContain("Fraunces");
  });

  it("puts a lucide Plus on outline Add meal, matching Swap/Remove treatment", () => {
    const empty = readFileSync(
      path.resolve(import.meta.dirname, "../components/empty-day-card.tsx"),
      "utf8",
    );
    expect(empty).toContain('import { Minus, Plus } from "lucide-react"');
    expect(empty).toContain('<Plus className="size-5" />');
    expect(empty).toMatch(/size="fat"[\s\S]*?variant="outline"[\s\S]*?className="mt-4 w-full gap-2"/);
    expect(empty).not.toMatch(/variant="primary"[\s\S]{0,180}EMPTY_DAY_ADD/);
  });

  it("puts a People stepper above Note and starts from that night's servings", () => {
    const empty = readFileSync(
      path.resolve(import.meta.dirname, "../components/empty-day-card.tsx"),
      "utf8",
    );
    const week = readFileSync(path.resolve(import.meta.dirname, "../app/week/page.tsx"), "utf8");
    const people = empty.indexOf("ADD_SHEET_PEOPLE_LABEL");
    const note = empty.indexOf("ADD_SHEET_NOTE_LABEL");
    const send = empty.indexOf("ADD_SHEET_SEND");
    expect(people).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(people);
    expect(send).toBeGreaterThan(note);
    expect(empty).toContain('data-slot="dinner-people-stepper"');
    expect(empty).toContain("dinnerRequestPeople(servings)");
    expect(empty).toContain("disabled={people <= MIN_HEADCOUNT}");
    expect(empty).toContain("setPeople(dinnerRequestPeople(people - 1))");
    expect(empty).toContain("setPeople(dinnerRequestPeople(people + 1))");
    expect(empty).toContain("onAdd(draft.trim(), dinnerRequestPeople(people))");
    expect(empty).not.toMatch(/useState\(\s*[24]\s*\)/);
    expect(empty).not.toContain("DEFAULT_FAMILY_SIZE");
    expect(empty).not.toContain("DEFAULT_COUPLE_SIZE");
    expect(empty).not.toContain("requestBotWake");
    expect(empty).not.toContain("check_now");
    expect(empty).not.toContain("needs_work");
    expect(empty).not.toContain("wakeWeekOrPlanChange");
    expect(week).toMatch(/EmptyDayCard[\s\S]*?servings=\{meal\.servings\}[\s\S]*?onAdd=\{/);
    expect(week).toContain('onAct(meal.id, "request_new_meal", note, people)');
  });
});
