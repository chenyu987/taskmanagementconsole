import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import { hasPendingInviteFor } from "../convex/invites";
import { getViewerFromApiToken } from "../convex/lib/access";
import { CXUQ, LYC, STRANGER, expectError, setup } from "./fixtures";

describe("注册门禁：不公开注册", () => {
  test("只有未认领邀请的邮箱能注册（大小写不敏感）", async () => {
    const { t } = await setup();
    // fixtures 里两人都已认领，先放出一条 cxuq 的未认领邀请
    await t.run(async (ctx) => {
      for (const m of await ctx.db.query("memberships").collect()) {
        if (m.email === CXUQ.email) await ctx.db.patch(m._id, { userId: undefined });
      }
    });
    const check = (email: string) => t.run((ctx) => hasPendingInviteFor(ctx, email));
    expect(await check(" CXUQ@Example.com ")).toBe(true);
    expect(await check(LYC.email)).toBe(false); // 已认领，不能再注册第二个账号
    expect(await check(STRANGER.email)).toBe(false); // 没有邀请
    expect(await t.query(internal.invites.hasPendingInvite, { email: STRANGER.email })).toBe(false);
  });
});

describe("API token（为 MCP 预留）", () => {
  test("签发后解析成本人的 Viewer，只存哈希", async () => {
    const { t, ids } = await setup();
    const { token, tokenId } = await t.action(internal.apiTokens.issue, {
      email: LYC.email,
      name: "test",
    });
    expect(token.startsWith("tmc_")).toBe(true);
    const viewer = await t.run(async (ctx) => {
      const v = await getViewerFromApiToken(ctx, token);
      return { userId: v.userId, hasPersonal: v.workspaceIds.has(ids.personalWs) };
    });
    expect(viewer).toEqual({ userId: LYC.subject, hasPersonal: true });
    const stored = await t.run(async (ctx) => JSON.stringify(await ctx.db.query("apiTokens").collect()));
    expect(stored).not.toContain(token);

    await t.mutation(internal.apiTokens.revoke, { tokenId: tokenId as never });
    await expectError(
      t.run(async (ctx) => (await getViewerFromApiToken(ctx, token)).userId),
      "UNAUTHENTICATED",
    );
  });

  test("伪造或乱写的 token：UNAUTHENTICATED", async () => {
    const { t } = await setup();
    await expectError(t.run((ctx) => getViewerFromApiToken(ctx, "tmc_fake").then((v) => v.userId)), "UNAUTHENTICATED");
    await expectError(t.run((ctx) => getViewerFromApiToken(ctx, "").then((v) => v.userId)), "UNAUTHENTICATED");
  });

  test("没注册的邮箱不能签发", async () => {
    const { t } = await setup();
    await expect(
      t.action(internal.apiTokens.issue, { email: STRANGER.email, name: "x" }),
    ).rejects.toThrow();
  });
});
