import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkProof,
  isDependabotAuthor,
} from "./check-pr-proof.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const parser = path.join(here, "check-pr-proof.mjs");
const fixtures = path.join(here, "pr-proof-fixtures");
const workflow = path.join(here, "../.github/workflows/pr-proof.yml");

function loadFixture(name) {
  return fs.readFileSync(path.join(fixtures, name), "utf8");
}

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [parser, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

describe("checkProof", () => {
  it("fails when the Proof section is missing", () => {
    const result = checkProof(loadFixture("missing.md"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing heading");
  });

  it("fails when the Proof section is empty", () => {
    const result = checkProof(loadFixture("empty.md"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "empty");
  });

  it("fails when the Proof section is only the template placeholder", () => {
    const result = checkProof(loadFixture("placeholder.md"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "placeholder only");
  });

  it("fails when the Proof section is only a visible placeholder line", () => {
    const result = checkProof(
      "## Proof\n\nscreenshot, Playwright trace, pasted npm test output, or a link to a passing check\n",
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "placeholder only");
  });

  it("passes on valid text", () => {
    const result = checkProof(loadFixture("valid-text.md"));
    assert.equal(result.ok, true);
  });

  it("passes on a valid image link", () => {
    const result = checkProof(loadFixture("valid-image.md"));
    assert.equal(result.ok, true);
  });

  it("passes with CRLF line endings", () => {
    const result = checkProof(
      "## Proof\r\n\r\nnpm test passed locally.\r\n## Feature map\r\n\r\nnone\r\n",
    );
    assert.equal(result.ok, true);
  });

  it("fails when the only content is a Cursor footer badge", () => {
    const result = checkProof(
      "## Proof\n\n<div><a href=\"https://cursor.com/agents/bc-test\"><img alt=\"Open in Web\" src=\"https://cursor.com/assets/images/open-in-web-dark.png\"></a></div>\n",
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "empty");
  });
});

describe("dependabot", () => {
  it("recognizes dependabot[bot] and not a human login", () => {
    assert.equal(isDependabotAuthor("dependabot[bot]"), true);
    assert.equal(isDependabotAuthor("timdoes"), false);
  });

  it("CLI exits 0 for dependabot[bot] even when the body has no Proof", () => {
    const result = runCli([path.join(fixtures, "missing.md")], {
      PR_AUTHOR: "dependabot[bot]",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dependabot\[bot\]/);
  });
});

describe("CLI fixtures", () => {
  it("fails a body without proof", () => {
    const result = runCli([path.join(fixtures, "missing.md")], {
      PR_AUTHOR: "timdoes",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing heading/);
  });

  it("fails an empty Proof section", () => {
    const result = runCli([path.join(fixtures, "empty.md")], {
      PR_AUTHOR: "timdoes",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /empty/);
  });

  it("passes a body with proof text", () => {
    const result = runCli([path.join(fixtures, "valid-text.md")], {
      PR_AUTHOR: "timdoes",
    });
    assert.equal(result.status, 0, result.stderr);
  });
});

describe("Proof workflow", () => {
  const yml = fs.readFileSync(workflow, "utf8");

  it("names the job Proof and does not skip dependabot at workflow or job level", () => {
    assert.match(yml, /^ {2}Proof:\s*$/m);
    assert.match(yml, /^\s{4}name: Proof\s*$/m);
    assert.doesNotMatch(yml, /\bif:.*dependabot/);
  });

  it("passes the PR body as env BODY, never interpolated into run:", () => {
    assert.match(yml, /BODY:\s*\$\{\{\s*github\.event\.pull_request\.body\s*\}\}/);
    assert.match(yml, /PR_AUTHOR:\s*\$\{\{\s*github\.event\.pull_request\.user\.login\s*\}\}/);
    const runLines = yml.split("\n").filter((line) => /^\s+run:/.test(line));
    for (const line of runLines) {
      assert.doesNotMatch(line, /github\.event\.pull_request\.body/);
    }
  });

  it("re-runs when the PR body is edited", () => {
    assert.match(yml, /types:\s*\[opened, edited, synchronize, reopened\]/);
  });
});
