import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { normalizeEmail } from "./lib/email";

/** 这个邮箱有没有还没被认领的邀请。注册门禁只认这个。 */
export async function hasPendingInviteFor(
  ctx: QueryCtx,
  email: string,
): Promise<boolean> {
  const invites = await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .collect();
  return invites.some((m) => m.userId === undefined);
}

/**
 * 注册门禁：Better Auth 新建用户前调用（convex/auth.ts 的 databaseHooks）。
 * 不公开注册——只有 LYC 发过邀请、且还没被认领的邮箱才能建账号。
 */
export const hasPendingInvite = internalQuery({
  args: { email: v.string() },
  handler: (ctx, { email }) => hasPendingInviteFor(ctx, email),
});
