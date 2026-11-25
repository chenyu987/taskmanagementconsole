import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizeEmail } from "./memberships";
import { positionUnder } from "./lib/tree";

/**
 * 初始化：建「私人」和「EverHarvest」两个工作区和它们的根节点，并发出邀请。
 * 只能在命令行用部署管理员身份运行（internal 函数，前端调不到）：
 *
 *   npx convex run admin:bootstrap '{"ownerEmail":"你的邮箱","teamEmails":["cxuq 的邮箱"]}'
 *
 * EverHarvest 根节点挂在私人根节点下面（父空间成员 ⊆ 子空间成员，符合挂载规则）。
 * 重复运行不会重复创建。
 */
export const bootstrap = internalMutation({
  args: { ownerEmail: v.string(), teamEmails: v.array(v.string()) },
  handler: async (ctx, { ownerEmail, teamEmails }) => {
    const existing = await ctx.db.query("workspaces").first();
    if (existing) return { created: false };

    const now = Date.now();
    const owner = normalizeEmail(ownerEmail);

    const personalWs = await ctx.db.insert("workspaces", {
      name: "私人",
      createdBy: owner,
      createdAt: now,
    });
    const personalRoot = await ctx.db.insert("nodes", {
      title: "人生",
      type: "vision",
      ancestorIds: [],
      path: "",
      depth: 0,
      sortKey: "a0",
      workspaceId: personalWs,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(personalRoot, positionUnder(null, personalRoot));
    await ctx.db.patch(personalWs, { rootNodeId: personalRoot });
    await ctx.db.insert("memberships", {
      workspaceId: personalWs,
      email: owner,
      role: "owner",
      createdAt: now,
    });

    const teamWs = await ctx.db.insert("workspaces", {
      name: "EverHarvest",
      createdBy: owner,
      createdAt: now,
    });
    const personalRootDoc = (await ctx.db.get(personalRoot))!;
    const teamRoot = await ctx.db.insert("nodes", {
      title: "EverHarvest",
      type: "area",
      parentId: personalRoot,
      ancestorIds: [],
      path: "",
      depth: 0,
      sortKey: "a0",
      workspaceId: teamWs,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(teamRoot, positionUnder(personalRootDoc, teamRoot));
    await ctx.db.patch(teamWs, { rootNodeId: teamRoot });
    await ctx.db.insert("memberships", {
      workspaceId: teamWs,
      email: owner,
      role: "owner",
      createdAt: now,
    });
    for (const email of teamEmails) {
      await ctx.db.insert("memberships", {
        workspaceId: teamWs,
        email: normalizeEmail(email),
        role: "member",
        createdAt: now,
      });
    }
    return { created: true };
  },
});
