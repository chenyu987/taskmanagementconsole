import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

/**
 * 界面文字的源语言是中文，英文是翻译。
 * 新加或改动界面文字后运行 `npm run i18n:extract`，再在 src/locales/en/messages.po 里补英文。
 * tests/i18n.test.ts 会检查英文没有漏翻。
 */
export default defineConfig({
  sourceLocale: "zh-CN",
  locales: ["zh-CN", "en"],
  // 不记行号，避免改一行代码就让翻译文件出现一堆无关差异
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      exclude: ["**/design-preview/**"],
    },
  ],
});
