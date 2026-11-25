import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertNode, canAccessWorkspace, redactNode } from "./lib/access";
import { authedQuery } from "./lib/functions";

/** 读一个节点（祖先链已按读者权限裁剪）。无权或不存在都抛 NOT_FOUND。 */
export const get = authedQuery({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const node = await assertNode(ctx, ctx.viewer, nodeId);
    return await redactNode(ctx, ctx.viewer, node);
  },
});

/** 列出一个节点的直接子节点，按 sortKey 排序；跳过回收站和读者无权看到的子节点。 */
export const listChildren = authedQuery({
  args: { parentId: v.id("nodes") },
  handler: async (ctx, { parentId }) => {
    await assertNode(ctx, ctx.viewer, parentId);
    const children = await ctx.db
      .query("nodes")
      .withIndex("by_parent_sort", (q) => q.eq("parentId", parentId))
      .collect();
    const cache = new Map<Id<"nodes">, Id<"workspaces"> | null>();
    const visible = [];
    for (const child of children) {
      if (child.deletedAt !== undefined) continue;
      if (!canAccessWorkspace(ctx.viewer, child.workspaceId)) continue;
      visible.push(await redactNode(ctx, ctx.viewer, child, cache));
    }
    return visible;
  },
});
