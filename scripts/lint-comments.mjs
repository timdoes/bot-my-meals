#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const CODE_PATH = /\.(?:[cm]?[jt]sx?|css|sql)$/i;

export function extractAddedComments(diffText) {
  const comments = [];
  let file = null;
  let skipFile = true;
  let newLine = 0;

  for (const rawLine of normalizeNewlines(diffText).split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      file = null;
      skipFile = true;
      continue;
    }
    if (rawLine.startsWith("+++ ")) {
      const path = rawLine.slice(4).trim();
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      skipFile = !file || !CODE_PATH.test(file);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(rawLine);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      if (!skipFile && file) {
        const comment = commentFromAddedLine(rawLine.slice(1));
        if (comment) comments.push({ file, line: newLine, text: comment });
      }
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith(" ")) {
      newLine += 1;
    }
  }

  return comments;
}

export function commentFromAddedLine(line) {
  const trimmed = line.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("{/*")
  ) {
    return trimmed;
  }
  const inline = firstInlineCommentIndex(line);
  if (inline === -1) return null;
  return line.slice(inline).trim();
}

export function formatCommentReview(comments, baseLabel) {
  const header = `Comment review — ${comments.length} comment${
    comments.length === 1 ? "" : "s"
  } added vs ${baseLabel}`;
  if (comments.length === 0) {
    return `${header}\n`;
  }
  const lines = [
    header,
    "",
    "Judge each as a tautology (repeats the code), an excuse (justifies a hack),",
    "or a keep (constraint we cannot change). See docs/no-comments.md.",
    "",
  ];
  for (const comment of comments) {
    lines.push(`${comment.file}:${comment.line}`);
    lines.push(`  ${comment.text}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function resolveBase(env = process.env, argv = process.argv, exists = refExists) {
  const fromArgs = flagValue(argv, "--base");
  if (fromArgs) return fromArgs;
  const fromEnv = env.COMMENTS_BASE;
  if (fromEnv && !isZeroSha(fromEnv)) return fromEnv;
  for (const candidate of ["origin/main", "main"]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function resolveHead(env = process.env, argv = process.argv) {
  return flagValue(argv, "--head") || env.COMMENTS_HEAD || "HEAD";
}

export function isZeroSha(value) {
  return typeof value === "string" && /^0+$/.test(value);
}

export function main(env = process.env, argv = process.argv) {
  const base = resolveBase(env, argv);
  const head = resolveHead(env, argv);
  if (!base) {
    console.log(
      "Comment review — skipped (no COMMENTS_BASE / origin/main / main).",
    );
    return 0;
  }

  const diff = readDiff(base, head);
  if (diff.error) {
    console.log(`Comment review — skipped (${diff.error}).`);
    return 0;
  }

  const comments = extractAddedComments(diff.text);
  process.stdout.write(formatCommentReview(comments, base));
  return 0;
}

function firstInlineCommentIndex(line) {
  let inSingle = false;
  let inDouble = false;
  let inTick = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (!inSingle && !inDouble && !inTick) {
      if (ch === "/" && next === "/" && line[i - 1] !== ":" && line[i - 1] !== "\\") {
        return i;
      }
      if (ch === "/" && next === "*") return i;
      if (ch === "{" && next === "/" && line[i + 2] === "*") return i;
    }
    if (ch === "\\" && (inSingle || inDouble || inTick)) {
      i += 1;
      continue;
    }
    if (ch === "'" && !inDouble && !inTick) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && !inTick) inDouble = !inDouble;
    else if (ch === "`" && !inSingle && !inDouble) inTick = !inTick;
  }
  return -1;
}

function readDiff(base, head) {
  const threeDot = git([
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    `${base}...${head}`,
  ]);
  if (threeDot.status === 0) return { text: threeDot.stdout };
  const twoDot = git([
    "diff",
    "--unified=0",
    "--no-color",
    "--no-ext-diff",
    base,
    head,
  ]);
  if (twoDot.status === 0) return { text: twoDot.stdout };
  return {
    error: (threeDot.stderr || twoDot.stderr || "git diff failed").trim(),
  };
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function refExists(ref) {
  const result = git(["rev-parse", "--verify", "--quiet", ref]);
  return result.status === 0;
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
