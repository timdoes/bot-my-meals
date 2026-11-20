import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESLint } from "eslint";
import {
  looksLikeCode,
  todoMissingLink,
  suppressionMissingDescription,
} from "./eslint-comments-plugin.mjs";

describe("looksLikeCode", () => {
  it("flags commented-out statements", () => {
    assert.equal(looksLikeCode("const x = 1;"), true);
    assert.equal(looksLikeCode("function foo() {}"), true);
    assert.equal(looksLikeCode("import { x } from './x';"), true);
    assert.equal(looksLikeCode("if (ready) {"), true);
    assert.equal(looksLikeCode("foo();"), true);
    assert.equal(looksLikeCode("<img src={src} />"), true);
  });

  it("leaves English and directives alone", () => {
    assert.equal(looksLikeCode("Called from a Server Component."), false);
    assert.equal(looksLikeCode("return the default week"), false);
    assert.equal(looksLikeCode("eslint-disable-next-line no-console -- logs"), false);
    assert.equal(looksLikeCode("@ts-expect-error vendor types"), false);
    assert.equal(looksLikeCode(""), false);
  });
});

describe("todoMissingLink", () => {
  it("requires a URL or #123 on TODO/FIXME/HACK/XXX", () => {
    assert.equal(todoMissingLink("TODO: remove this"), true);
    assert.equal(todoMissingLink("FIXME later"), true);
    assert.equal(todoMissingLink("HACK: skip empty"), true);
    assert.equal(
      todoMissingLink("TODO: remove GET https://github.com/timdoes/bot-my-meals/pull/89"),
      false,
    );
    assert.equal(todoMissingLink("TODO(#89): remove GET"), false);
    assert.equal(todoMissingLink("TODO: remove GET after one release. #89"), false);
    assert.equal(todoMissingLink("just a comment"), false);
  });
});

describe("suppressionMissingDescription", () => {
  it("requires a reason on biome-ignore", () => {
    assert.equal(suppressionMissingDescription("biome-ignore lint"), true);
    assert.equal(
      suppressionMissingDescription("biome-ignore lint/style/noNonNullAssertion: vendor types"),
      false,
    );
    assert.equal(suppressionMissingDescription("biome-ignore lint -- vendor types"), false);
  });
});

describe("eslint config", () => {
  async function messages(code, filePath = "src/comments-sample.ts") {
    const eslint = new ESLint();
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.map((message) => ({
      ruleId: message.ruleId,
      message: message.message,
    }));
  }

  it("fails a TODO without a link", async () => {
    const found = await messages("const x = 1;\n// TODO: remove this\n");
    assert.ok(
      found.some((row) => row.ruleId === "comments/todo-needs-link"),
      JSON.stringify(found),
    );
  });

  it("fails commented-out code", async () => {
    const found = await messages("const x = 1;\n// const y = 2;\n");
    assert.ok(
      found.some((row) => row.ruleId === "comments/no-commented-out-code"),
      JSON.stringify(found),
    );
  });

  it("fails a bare eslint-disable", async () => {
    const found = await messages(
      "const x = 1;\n// eslint-disable-next-line no-console\nconsole.log(x);\n",
    );
    assert.ok(
      found.some(
        (row) =>
          row.ruleId === "@eslint-community/eslint-comments/require-description",
      ),
      JSON.stringify(found),
    );
  });

  it("fails a bare @ts-expect-error", async () => {
    const found = await messages("const x = 1;\n// @ts-expect-error\nconst y: string = 1;\n");
    assert.ok(
      found.some((row) => row.ruleId === "@typescript-eslint/ban-ts-comment"),
      JSON.stringify(found),
    );
    assert.ok(
      found.every((row) => row.ruleId !== "comments/require-suppression-description"),
      JSON.stringify(found),
    );
  });

  it("fails a bare biome-ignore", async () => {
    const found = await messages("const x = 1;\n// biome-ignore lint\n");
    assert.ok(
      found.some((row) => row.ruleId === "comments/require-suppression-description"),
      JSON.stringify(found),
    );
  });

  it("passes a TODO with a PR link and a described disable", async () => {
    const found = await messages(
      [
        "const x = 1;",
        "// TODO: remove GET after one release. https://github.com/timdoes/bot-my-meals/pull/89",
        "// eslint-disable-next-line no-console -- wake probe leftover",
        "console.log(x);",
        "",
      ].join("\n"),
    );
    const commentRules = found.filter((row) =>
      /comment|ban-ts-comment/.test(row.ruleId ?? ""),
    );
    assert.deepEqual(commentRules, [], JSON.stringify(found));
  });
});
