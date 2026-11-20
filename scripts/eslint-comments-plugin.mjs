const TODO_MARKER = /\b(?:TODO|FIXME|HACK|XXX)\b/;
const TODO_LINK =
  /https?:\/\/\S+|\/(?:issues|pull|discussions)\/\d+|\(\s*#\d+\s*\)|(?:^|\s)#\d+\b/i;
const DIRECTIVE_LINE =
  /^(?:eslint(?:-.+)?|globals?|exported|biome-ignore|prettier-ignore|istanbul|c8|v8-ignore|webpack(?:ChunkName|Ignore)?|vite-|@vite|@ts-|@jsx\b|@type\b|@satisfies\b|@license|@preserve|@copyright|spdx-|copyright\b|licensed?\b|#__(?:PURE|NO_SIDE_EFFECTS)__)/i;
const CODE_LINE =
  /^(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\b|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$]|(?:import|export)\s+(?:type\s+)?(?:\{|[\w*'"`])|(?:return|throw)\s*(?:[;{(`'"`]|[A-Za-z_$][\w$]*\s*[;(])|(?:await|yield)\s+[A-Za-z_$][\w$]*\s*\(|(?:if|for|while|switch)\s*\(|try\s*\{|(?:else\s+)?if\s*\(|\}\s*(?:else|catch|finally)\b|[A-Za-z_$][\w$]*\s*\([^;]*\)\s*;|[A-Za-z_$][\w$]*\s*=\s*[^=\n]+;|<(?:[A-Z][\w$]*|div|span|p|img|button|input|form|a|ul|li|section|header|footer|main|nav|table)\b)/;
const BIOME_IGNORE = /^biome-ignore\b(.*)$/;

export function commentLines(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*+\s?/, "").trim())
    .filter(Boolean);
}

export function looksLikeCode(raw) {
  const lines = commentLines(raw);
  if (lines.length === 0) return false;
  return lines.some((line) => !DIRECTIVE_LINE.test(line) && CODE_LINE.test(line));
}

export function todoMissingLink(raw) {
  const text = String(raw);
  if (!TODO_MARKER.test(text)) return false;
  return !TODO_LINK.test(text);
}

export function suppressionMissingDescription(raw) {
  for (const line of commentLines(raw)) {
    const biome = BIOME_IGNORE.exec(line);
    if (biome && !hasSuppressionReason(biome[1])) return true;
  }
  return false;
}

function hasSuppressionReason(rest) {
  const text = rest.trim();
  if (/:\s+\S/.test(text)) return true;
  if (/\s--\s+\S/.test(text)) return true;
  return false;
}

function isJsdoc(comment) {
  return comment.type === "Block" && comment.value.startsWith("*");
}

function isLegalHeader(raw) {
  return /\b(?:copyright|license|spdx-license-identifier)\b/i.test(raw);
}

const plugin = {
  meta: {
    name: "bot-my-meals-comments",
    version: "1.0.0",
  },
  rules: {
    "no-commented-out-code": {
      meta: {
        type: "problem",
        docs: {
          description: "Disallow commented-out code",
        },
        schema: [],
        messages: {
          commentedOut:
            "Commented-out code is not allowed. Delete it or restore it as real code.",
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (isJsdoc(comment) || isLegalHeader(comment.value)) continue;
              if (looksLikeCode(comment.value)) {
                context.report({ loc: comment.loc, messageId: "commentedOut" });
              }
            }
          },
        };
      },
    },
    "todo-needs-link": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require TODO/FIXME/HACK/XXX comments to include an issue or PR link",
        },
        schema: [],
        messages: {
          missingLink:
            "TODO/FIXME/HACK/XXX comments need an issue or PR link (https URL or #123).",
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (todoMissingLink(comment.value)) {
                context.report({ loc: comment.loc, messageId: "missingLink" });
              }
            }
          },
        };
      },
    },
    "require-suppression-description": {
      meta: {
        type: "problem",
        docs: {
          description: "Require a reason on biome-ignore comments",
        },
        schema: [],
        messages: {
          missingReason:
            "biome-ignore comments need a reason (`biome-ignore lint/rule: …` or `-- …`).",
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (suppressionMissingDescription(comment.value)) {
                context.report({ loc: comment.loc, messageId: "missingReason" });
              }
            }
          },
        };
      },
    },
  },
};

export default plugin;
