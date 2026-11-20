import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  commentFromAddedLine,
  extractAddedComments,
  formatCommentReview,
  isZeroSha,
  resolveBase,
} from "./lint-comments.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflow = path.join(here, "../.github/workflows/ci.yml");
const script = path.join(here, "lint-comments.mjs");

describe("extractAddedComments", () => {
  it("lists added line and inline comments in code files", () => {
    const diff = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,0 +1,3 @@",
      "+const x = 1;",
      "+// tautology",
      "+const y = 2; // inline keep",
      "diff --git a/docs/no-comments.md b/docs/no-comments.md",
      "--- a/docs/no-comments.md",
      "+++ b/docs/no-comments.md",
      "@@ -1,0 +1 @@",
      "+// not code",
    ].join("\n");

    assert.deepEqual(extractAddedComments(diff), [
      { file: "src/foo.ts", line: 2, text: "// tautology" },
      { file: "src/foo.ts", line: 3, text: "// inline keep" },
    ]);
  });

  it("does not treat https:// or regex \\// as a comment", () => {
    assert.equal(
      commentFromAddedLine('const url = "https://example.com";'),
      null,
    );
    assert.equal(
      commentFromAddedLine(
        String.raw`file = path === "/dev/null" ? null : path.replace(/^b\//, "");`,
      ),
      null,
    );
    assert.equal(
      commentFromAddedLine("fetch(url); // wake the bot"),
      "// wake the bot",
    );
  });
});

describe("formatCommentReview", () => {
  it("prints a zero and a non-zero summary", () => {
    assert.match(formatCommentReview([], "main"), /0 comments added vs main/);
    const text = formatCommentReview(
      [{ file: "src/foo.ts", line: 4, text: "// excuse" }],
      "main",
    );
    assert.match(text, /1 comment added vs main/);
    assert.match(text, /src\/foo\.ts:4/);
    assert.match(text, /docs\/no-comments\.md/);
  });
});

describe("resolveBase", () => {
  it("prefers --base, then COMMENTS_BASE, and ignores a zero SHA", () => {
    assert.equal(
      resolveBase({ COMMENTS_BASE: "abc" }, ["node", "lint-comments.mjs", "--base", "cli"], () => false),
      "cli",
    );
    assert.equal(
      resolveBase({ COMMENTS_BASE: "abc" }, ["node", "lint-comments.mjs"], () => false),
      "abc",
    );
    assert.equal(
      resolveBase({ COMMENTS_BASE: "0000000" }, ["node", "lint-comments.mjs"], (ref) => ref === "main"),
      "main",
    );
  });

  it("treats an all-zero SHA as missing", () => {
    assert.equal(isZeroSha("0000000000000000000000000000000000000000"), true);
    assert.equal(isZeroSha("abc"), false);
  });
});

describe("CLI", () => {
  it("exits 0 and prints a review against HEAD", () => {
    const result = spawnSync(process.execPath, [script, "--base", "HEAD"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Comment review — 0 comments added vs HEAD/);
  });
});

describe("CI workflow", () => {
  const yml = fs.readFileSync(workflow, "utf8");

  it("runs lint:comments after lint and diffs against the PR base", () => {
    assert.match(yml, /npm run lint:comments/);
    assert.match(yml, /COMMENTS_BASE:/);
    assert.match(yml, /fetch-depth:\s*0/);
  });
});
