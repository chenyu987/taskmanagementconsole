import { ConvexError, v } from "convex/values";
import { assertLink, assertNode } from "./lib/access";
import { authedMutation } from "./lib/functions";

/**
 * 依赖连线（depends_on）：from 依赖 to，to 没完成 from 就不能开工。
 * 权限规则 5：两端都可写才可改（读者是两端所在空间的成员）；不存在和无权一律 NOT_FOUND。
 */
function fail(code: string): never {
  throw new ConvexError({ code });
}

export const addDependency = authedMutation({
  args: { fromId: v.id("nodes"), toId: v.id("nodes") },
  handler: async (ctx, { fromId, toId }) => {
    await assertNode(ctx, ctx.viewer, fromId);
    await assertNode(ctx, ctx.viewer, toId);
    if (fromId === toId) fail("INVALID_LINK");
    const existing = await ctx.db
      .query("nodeLinks")
      .withIndex("by_from", (q) => q.eq("fromId", fromId).eq("kind", "depends_on"))
      .collect();
    const dup = existing.find((l) => l.toId === toId);
    if (dup) return dup._id;
    // 不允许直接形成环：to 已经（直接）依赖 from
    const reverse = await ctx.db
      .query("nodeLinks")
      .withIndex("by_from", (q) => q.eq("fromId", toId).eq("kind", "depends_on"))
      .collect();
    if (reverse.some((l) => l.toId === fromId)) fail("INVALID_LINK");
    return await ctx.db.insert("nodeLinks", { fromId, toId, kind: "depends_on", createdAt: Date.now() });
  },
});

export const remove = authedMutation({
  args: { linkId: v.id("nodeLinks") },
  handler: async (ctx, { linkId }) => {
    await assertLink(ctx, ctx.viewer, linkId);
    await ctx.db.delete(linkId);
  },
});
