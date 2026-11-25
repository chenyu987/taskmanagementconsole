// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/**
 * 中英双语：界面文字的源语言是中文，英文翻译不能漏。
 * 新加界面文字后运行 `npm run i18n:extract`，再补 src/locales/en/messages.po 的 msgstr。
 * CI 还会检查翻译文件是否已随代码更新（`npm run i18n:check`）。
 */
function entries(locale: string): Map<string, string> {
  const po = readFileSync(new URL(`../src/locales/${locale}/messages.po`, import.meta.url), "utf8");
  const map = new Map<string, string>();
  const re = /^msgid "(.*)"\nmsgstr "(.*)"$/gm;
  for (const m of po.matchAll(re)) if (m[1] !== "") map.set(m[1], m[2]);
  return map;
}

describe("翻译文件", () => {
  test("每条中文界面文字都有英文翻译", () => {
    const zh = entries("zh-CN");
    const en = entries("en");
    expect(zh.size).toBeGreaterThan(0);
    const missing = [...zh.keys()].filter((id) => !en.get(id));
    expect(missing, `缺英文翻译：\n${missing.join("\n")}`).toEqual([]);
  });

  test("英文翻译保留了原文里的占位符", () => {
    for (const [id, text] of entries("en")) {
      const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(vars(text), id).toEqual(vars(id));
    }
  });
});
