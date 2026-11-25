import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/functions";

/**
 * 每个用户自己的界面偏好（目前只有语言）。存在 viewPrefs 表里 view = "app" 的那一行。
 * 只读写当前用户自己的行，不涉及任何工作区数据。
 */
const APP_VIEW = "app";

export const get = authedQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("viewPrefs")
      .withIndex("by_user_view", (q) => q.eq("userId", ctx.viewer.userId).eq("view", APP_VIEW))
      .unique();
    const settings = (row?.settings ?? {}) as { locale?: string };
    return { locale: settings.locale ?? null };
  },
});

export const setLocale = authedMutation({
  args: { locale: v.union(v.literal("zh-CN"), v.literal("en")) },
  handler: async (ctx, { locale }) => {
    const row = await ctx.db
      .query("viewPrefs")
      .withIndex("by_user_view", (q) => q.eq("userId", ctx.viewer.userId).eq("view", APP_VIEW))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { settings: { ...(row.settings ?? {}), locale } });
    } else {
      await ctx.db.insert("viewPrefs", { userId: ctx.viewer.userId, view: APP_VIEW, settings: { locale } });
    }
  },
});
