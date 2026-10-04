import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname);

describe("Request a new dinner people persist", () => {
  it("saves that night's servings on Request dinner and does not wake the stepper", () => {
    const empty = readFileSync(path.join(srcRoot, "../components/empty-day-card.tsx"), "utf8");
    const week = readFileSync(path.join(srcRoot, "../app/week/page.tsx"), "utf8");
    const provider = readFileSync(path.join(srcRoot, "../components/supper-provider.tsx"), "utf8");
    const repo = readFileSync(path.join(srcRoot, "supabase/repo.ts"), "utf8");
    const headcount = readFileSync(path.join(srcRoot, "headcount.ts"), "utf8");
    const peopleFn = headcount.slice(
      headcount.indexOf("export function dinnerRequestPeople"),
      headcount.indexOf("export function withNightServings"),
    );
    const voteStart = provider.indexOf("setVote: (mealId, choice, note, servings)");
    const vote = provider.slice(voteStart, provider.indexOf("proposeReplacement:", voteStart));
    const save = repo.slice(
      repo.indexOf("export async function supabaseSaveNightServings"),
      repo.indexOf("export async function supabaseSetVote"),
    );
    const setVote = repo.slice(
      repo.indexOf("export async function supabaseSetVote"),
      repo.indexOf("export async function supabaseProposeReplacement"),
    );

    expect(peopleFn).toContain("MIN_HEADCOUNT");
    expect(peopleFn).not.toContain("DEFAULT_FAMILY_SIZE");
    expect(peopleFn).not.toContain("DEFAULT_COUPLE_SIZE");
    expect(empty).toContain("beginAdd");
    expect(empty).toContain("setPeople(dinnerRequestPeople(servings))");
    expect(empty).toMatch(/onClick=\{\(\) => setPeople\(dinnerRequestPeople\(people - 1\)\)\}/);
    expect(empty).toMatch(/onClick=\{\(\) => setPeople\(dinnerRequestPeople\(people \+ 1\)\)\}/);
    expect(empty).toMatch(/const requestDinner = \(\) => \{[\s\S]*onAdd\(draft\.trim\(\), dinnerRequestPeople\(people\)\)/);
    expect(empty).not.toContain("requestBotWake");
    expect(empty).not.toContain("localStorage");
    expect(week).toContain("setVote(mealId, choice, note, servings)");
    expect(week).not.toMatch(/beginAdd[\s\S]{0,80}setVote/);
    expect(vote).toContain("servings");
    expect(vote).toContain("supabaseSetVote");
    expect(vote).not.toContain("wakeWeekOrPlanChange");
    expect(vote).not.toContain("requestBotWake");
    expect(vote).not.toContain("check_now");
    expect(vote).not.toContain("saveWeekPeople");
    expect(setVote).toContain("voteSavesDinnerPeople(choice)");
    expect(setVote).toContain("supabaseSaveNightServings");
    expect(save).toContain('.from("meals")');
    expect(save).toContain('.eq("id", mealId)');
    expect(save).toContain("withNightServings");
    expect(save).toContain("night_headcounts");
    expect(save).not.toContain("save_week_people");
    expect(save).not.toContain('.from("households")');
    expect(save).not.toContain("requestBotWake");
    expect(save).not.toContain("check_now");
  });
});
