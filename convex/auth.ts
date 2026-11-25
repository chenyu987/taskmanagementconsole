import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { APIError } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

/**
 * 登录：Better Auth（经 Convex 官方组件 @convex-dev/better-auth），邮箱 + 密码。
 * 为什么不用 Clerk、为什么暂不开 Google / GitHub：见 CLAUDE.md「关键决定」。
 *
 * - 不公开注册：只有 memberships 里有未认领邀请的邮箱才能建账号（databaseHooks.user.create.before）。
 *   这道门禁对以后加上的 Google / GitHub 登录同样生效。
 * - 邀请即验证：门禁放行的邮箱注册时直接标记 emailVerified，之后 memberships.claimInvites 按邮箱绑定。
 *   已知风险：没有发信验证，谁先用被邀请的邮箱注册谁就拿到这份邀请——发出邀请后让对方尽快注册。
 * - 会话长期有效：90 天，期间每天使用会自动续期，手机 PWA 上基本不用重新登录。
 * - 登录成功不等于有权限：没有任何 membership 的账号读不到任何数据（见 lib/access.ts）。
 *
 * 需要的 Convex 环境变量：SITE_URL、BETTER_AUTH_SECRET。
 */
const siteUrl = process.env.SITE_URL!;

const DAY = 60 * 60 * 24;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    session: {
      expiresIn: 90 * DAY,
      updateAge: DAY,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const invited = await ctx.runQuery(internal.invites.hasPendingInvite, {
              email: user.email,
            });
            if (!invited) {
              throw new APIError("FORBIDDEN", {
                message: "这个邮箱没有收到邀请，请联系管理员。",
              });
            }
            return { data: { ...user, emailVerified: true } };
          },
        },
      },
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
