#!/usr/bin/env node
/**
 * Fail a PR body that has no filled-in ## Proof section.
 *
 *   BODY / PR_BODY_FILE  — PR body (Actions must pass these via env, never a run: interpolation)
 *   PR_AUTHOR            — github.event.pull_request.user.login; dependabot[bot] exits 0
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export const DEPENDABOT_LOGIN = "dependabot[bot]";

const PLACEHOLDER_LINE =
  /^(?:_*)(?:replace this:?\s*)?(?:add (?:a |your )?proof here|screenshot,?\s*(?:playwright\s+)?trace,?\s*(?:pasted\s+)?(?:`?npm test`?|test)(?:\s*\/\s*`?npm run lint`?)?\s*(?:output)?,?\s*or a link to a passing check)(?:_*)\.?$/i;

export function isDependabotAuthor(login) {
  return login === DEPENDABOT_LOGIN;
}

export function checkProof(body) {
  const text = normalizeNewlines(body ?? "");
  const section = extractProofSection(text);
  if (section === null) {
    return { ok: false, reason: "missing heading" };
  }

  const withoutComments = stripHtmlComments(section);
  const content = stripCursorChrome(withoutComments);
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    if (/<!--/.test(section)) {
      return { ok: false, reason: "placeholder only" };
    }
    return { ok: false, reason: "empty" };
  }

  if (lines.every((line) => PLACEHOLDER_LINE.test(line))) {
    return { ok: false, reason: "placeholder only" };
  }

  return { ok: true, reason: "ok" };
}

export function readBody(env = process.env, argv = process.argv) {
  if (env.PR_BODY_FILE) {
    return fs.readFileSync(env.PR_BODY_FILE, "utf8");
  }
  if (Object.hasOwn(env, "BODY")) {
    return env.BODY ?? "";
  }
  const arg = argv[2];
  if (arg && arg !== "-") {
    return fs.readFileSync(arg, "utf8");
  }
  return fs.readFileSync(0, "utf8");
}

export function main(env = process.env, argv = process.argv) {
  if (isDependabotAuthor(env.PR_AUTHOR)) {
    console.log(
      "Proof: dependabot[bot] — required check passes without a Proof section.",
    );
    return 0;
  }

  const result = checkProof(readBody(env, argv));
  if (!result.ok) {
    console.error(`::error::Proof section is empty: ${result.reason}`);
    return 1;
  }
  console.log("Proof section is present.");
  return 0;
}

function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractProofSection(text) {
  const heading = /^##[ \t]+proof[ \t]*$/im;
  const match = heading.exec(text);
  if (!match) return null;
  const after = text.slice(match.index + match[0].length);
  const next = /^##[ \t]+/m.exec(after);
  return next ? after.slice(0, next.index) : after;
}

function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function stripCursorChrome(text) {
  return text
    .replace(
      /<div>[\s\S]*?cursor\.com\/(?:agents|background-agent|assets)[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(/\[!\[[^\]]*\]\([^)]*cursor\.com[^)]*\)\]\([^)]+\)/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*cursor\.com[^)]*\)/gi, "");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
