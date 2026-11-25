import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { generateApiToken, hashApiToken } from "./lib/apiTokens";
import { normalizeEmail } from "./lib/email";

/**
 * API token 管理（为阶段 4 的 MCP 服务器预留）。都是 internal 函数，只能在命令行用部署管理员身份运行：
 *
 *   npx convex run apiTokens:issue '{"email":"你的邮箱","name":"claude-mcp"}'
 *   npx convex run apiTokens:revoke '{"tokenId":"…"}'
 *
 * token 代表那个用户本人，权限与网页登录完全一样，不多不少。明文只在签发时打印一次。
 */
export const issue = internalAction({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }): Promise<{ tokenId: string; token: string }> => {
    // 随机数必须在 action 里生成（query / mutation 的随机数是确定性的）
    const token = generateApiToken();
    const tokenHash = await hashApiToken(token);
    const tokenId: string = await ctx.runMutation(internal.apiTokens.store, {
      email,
      name,
      tokenHash,
      prefix: token.slice(0, 8),
    });
    return { tokenId, token };
  },
});

export const store = internalMutation({
  args: { email: v.string(), name: v.string(), tokenHash: v.string(), prefix: v.string() },
  handler: async (ctx, { email, name, tokenHash, prefix }) => {
    const membership = (
      await ctx.db
        .query("memberships")
        .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
        .collect()
    ).find((m) => m.userId !== undefined);
    if (!membership?.userId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "这个邮箱还没有注册并认领邀请" });
    }
    return await ctx.db.insert("apiTokens", {
      userId: membership.userId,
      name,
      tokenHash,
      prefix,
      createdAt: Date.now(),
    });
  },
});

export const revoke = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, { tokenId }) => {
    const token = await ctx.db.get(tokenId);
    if (!token) throw new ConvexError({ code: "NOT_FOUND" });
    if (token.revokedAt === undefined) await ctx.db.patch(tokenId, { revokedAt: Date.now() });
  },
});
