import { defineConfig, globalIgnores } from "eslint/config";
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import commentsPlugin from "./scripts/eslint-comments-plugin.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintComments.recommended,
  {
    plugins: {
      comments: commentsPlugin,
    },
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": true,
          minimumDescriptionLength: 3,
        },
      ],
      "comments/no-commented-out-code": "error",
      "comments/todo-needs-link": "error",
      "comments/require-suppression-description": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext / Wrangler / coverage artifacts (CI worker smoke build)
    ".open-next/**",
    ".wrangler/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
