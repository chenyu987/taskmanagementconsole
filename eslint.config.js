import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "convex/_generated", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // 权限规则：公开函数只能用 lib/functions.ts 的 authedQuery / authedMutation
    files: ["convex/**/*.ts"],
    ignores: ["convex/lib/functions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/_generated/server"],
              importNames: ["query", "mutation", "action", "httpAction"],
              message: "公开函数请用 convex/lib/functions.ts 的 authedQuery / authedMutation（见 CLAUDE.md 权限规则）",
            },
          ],
        },
      ],
    },
  },
);
