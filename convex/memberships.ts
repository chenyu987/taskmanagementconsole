import type { MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { normalizeEmail } from "./lib/email";
import { authedMutation } from "./lib/functions";

export { normalizeEmail };

/** 把发给这个邮箱、还没绑定用户的邀请绑定到该用户。返回新绑定的数量。 */
export async function claimInvitesForUser(
  ctx: MutationCtx,
  userId: string,
  email: string,
): Promise<number> {
  const invites = await ctx.db
    .query("memberships")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .collect();
  let claimed = 0;
  for (const invite of invites) {
    if (invite.userId === undefined) {
      await ctx.db.patch(invite._id, { userId });
      claimed++;
    }
  }
  return claimed;
}

/**
 * 登录后由前端调用一次：按登录邮箱认领邀请。
 * 只认领 Better Auth 里已验证的邮箱。邮箱 + 密码注册只对有邀请的邮箱开放，
 * 注册时就标记为已验证（见 convex/auth.ts 和 convex/invites.ts）。
 */
export const claimInvites = authedMutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user || !user.emailVerified) return 0;
    return await claimInvitesForUser(ctx, ctx.viewer.userId, user.email);
  },
});
