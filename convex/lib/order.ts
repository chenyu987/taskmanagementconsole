import { generateKeyBetween } from "fractional-indexing";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** 父节点下未删除的直接子节点，按 sortKey 排序（含所有工作区，只在服务端内部使用，不直接返回给前端）。 */
export async function liveChildren(ctx: QueryCtx, parentId: Id<"nodes">): Promise<Doc<"nodes">[]> {
  const rows = await ctx.db
    .query("nodes")
    .withIndex("by_parent_sort", (q) => q.eq("parentId", parentId))
    .collect();
  return rows.filter((n) => n.deletedAt === undefined);
}

/**
 * 同级排序键（分数索引）。
 * - afterId 省略：排到最后
 * - afterId 为 null：排到最前
 * - afterId 为某个兄弟节点：紧跟在它后面
 * exclude：移动时把节点自己从兄弟里排除。
 */
export async function sortKeyAt(
  ctx: QueryCtx,
  parentId: Id<"nodes">,
  afterId: Id<"nodes"> | null | undefined,
  exclude?: Id<"nodes">,
): Promise<string> {
  const siblings = (await liveChildren(ctx, parentId)).filter((n) => n._id !== exclude);
  let before: string | null;
  let after: string | null;
  if (afterId === undefined) {
    before = siblings.at(-1)?.sortKey ?? null;
    after = null;
  } else if (afterId === null) {
    before = null;
    after = siblings[0]?.sortKey ?? null;
  } else {
    const i = siblings.findIndex((n) => n._id === afterId);
    if (i < 0) throw new ConvexError({ code: "INVALID_POSITION" });
    before = siblings[i].sortKey;
    after = siblings[i + 1]?.sortKey ?? null;
  }
  try {
    return generateKeyBetween(before, after);
  } catch {
    // 历史数据里两个兄弟的排序键相同时无法插在中间，退而求其次紧跟在 before 后面
    return generateKeyBetween(before, null);
  }
}
