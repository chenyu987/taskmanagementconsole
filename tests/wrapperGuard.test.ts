// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * 守卫测试：convex/ 下的公开函数必须用 lib/functions.ts 的 authedQuery / authedMutation，
 * 不能从 _generated/server 导入裸 query / mutation / action / httpAction。
 * 只有 lib/functions.ts 自己可以导入它们。internal* 函数前端调不到，允许直接用。
 */
const CONVEX_DIR = join(__dirname, "..", "convex");
const ALLOWED_FILES = new Set(["lib/functions.ts"]);
const FORBIDDEN = ["query", "mutation", "action", "httpAction"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "_generated" || name === "node_modules") return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("所有公开函数都经过权限包装", () => {
  for (const file of walk(CONVEX_DIR)) {
    const rel = relative(CONVEX_DIR, file).replaceAll("\\", "/");
    if (ALLOWED_FILES.has(rel)) continue;
    test(rel, () => {
      const src = readFileSync(file, "utf8");
      const imports = [
        ...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][./]*_generated\/server["']/g),
      ].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "")));
      const bad = imports.filter((name) => FORBIDDEN.includes(name));
      expect(bad, `${rel} 直接导入了 ${bad.join(", ")}，请改用 lib/functions.ts 的包装`).toEqual([]);
      // 也不允许从 convex/server 绕过 _generated 直接构造公开函数
      expect(src).not.toMatch(/\b(queryGeneric|mutationGeneric|actionGeneric)\b/);
    });
  }
});
