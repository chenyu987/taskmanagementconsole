import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { claimInvitesForUser } from "../convex/memberships";
import { CXUQ, setup } from "./fixtures";

describe("认领邀请", () => {
  test("按邮箱绑定，大小写不敏感，只绑定一次", async () => {
    const { t } = await setup();
    // 先把 cxuq 的绑定清掉，模拟首次登录
    await t.run(async (ctx) => {
      for (const m of await ctx.db.query("memberships").collect()) {
        if (m.userId === CXUQ.subject) await ctx.db.patch(m._id, { userId: undefined });
      }
    });
    const first = await t.run((ctx) =>
      claimInvitesForUser(ctx, CXUQ.subject, "  CXUQ@Example.com "),
    );
    expect(first).toBe(1);
    const second = await t.run((ctx) =>
      claimInvitesForUser(ctx, "someone_else", CXUQ.email),
    );
    expect(second).toBe(0);
    const me = await t.withIdentity(CXUQ).query(api.viewer.me, {});
    expect(me.workspaces.map((w) => w.name)).toEqual(["EverHarvest"]);
  });

  test("bootstrap 重复运行不会重复创建", async () => {
    const { t } = await setup();
    const { internal } = await import("../convex/_generated/api");
    const res = await t.mutation(internal.admin.bootstrap, {
      ownerEmail: "a@b.c",
      teamEmails: [],
    });
    expect(res.created).toBe(false);
    const count = await t.run(async (ctx) => (await ctx.db.query("workspaces").collect()).length);
    expect(count).toBe(2);
  });
});
