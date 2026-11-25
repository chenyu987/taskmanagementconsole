import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { assertNode, getViewerFromApiToken } from "../convex/lib/access";
import {
  CXUQ,
  expectError,
  expectNoPrivateData,
  setup,
} from "./fixtures";

/**
 * 核心权限测试：以 cxuq 的身份读取或修改你私人空间的任何节点、祖先、连线或笔记，只要成功，测试就不通过。
 * 规则：以后每新增一个读类入口，都必须在这里加上对应用例（见 CLAUDE.md「权限规则」）。
 */
describe("cxuq 碰不到私人空间", () => {
  test("viewer.me 只列出 EverHarvest", async () => {
    const { cxuq, ids } = await setup();
    const me = await cxuq.query(api.viewer.me, {});
    expect(me.userId).toBe(CXUQ.subject);
    expect(me.workspaces.map((w) => w.name)).toEqual(["EverHarvest"]);
    expectNoPrivateData(me, [ids.personalWs, ids.personalRoot]);
  });

  test("按 id 读私人节点：NOT_FOUND，且与不存在的 id 无法区分", async () => {
    const { t, cxuq, ids } = await setup();
    await expectError(
      cxuq.query(api.nodes.get, { nodeId: ids.personalRoot }),
      "NOT_FOUND",
    );
    await expectError(
      cxuq.query(api.nodes.get, { nodeId: ids.personalChild }),
      "NOT_FOUND",
    );
    const deletedId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("nodes", {
        title: "tmp",
        type: "task",
        ancestorIds: [],
        path: "x/",
        depth: 0,
        sortKey: "a0",
        workspaceId: ids.teamWs,
        createdAt: 0,
        updatedAt: 0,
      });
      await ctx.db.delete(id);
      return id;
    });
    await expectError(
      cxuq.query(api.nodes.get, { nodeId: deletedId }),
      "NOT_FOUND",
    );
  });

  test("读 EverHarvest 根节点：祖先链、路径、深度都不暴露私人祖先", async () => {
    const { cxuq, ids } = await setup();
    const root = await cxuq.query(api.nodes.get, { nodeId: ids.teamRoot });
    expect(root.parentId).toBeUndefined();
    expect(root.ancestorIds).toEqual([]);
    expect(root.depth).toBe(0);
    expect(root.path).toBe(`${ids.teamRoot}/`);
    expectNoPrivateData(root, [ids.personalRoot, ids.personalChild, ids.personalWs]);

    const child = await cxuq.query(api.nodes.get, { nodeId: ids.teamChild });
    expect(child.ancestorIds).toEqual([ids.teamRoot]);
    expect(child.depth).toBe(1);
    expectNoPrivateData(child, [ids.personalRoot, ids.personalChild]);
  });

  test("列私人节点的子节点：NOT_FOUND", async () => {
    const { cxuq, ids } = await setup();
    await expectError(
      cxuq.query(api.nodes.listChildren, { parentId: ids.personalRoot }),
      "NOT_FOUND",
    );
  });

  test("列 EverHarvest 子节点：只有团队内容", async () => {
    const { cxuq, ids } = await setup();
    const children = await cxuq.query(api.nodes.listChildren, {
      parentId: ids.teamRoot,
    });
    expect(children.map((c) => c._id)).toEqual([ids.teamChild]);
    expectNoPrivateData(children, [ids.personalRoot, ids.personalChild]);
  });

  test("members.list：看不到私人空间有谁；EverHarvest 成员列表里没有私人数据", async () => {
    const { cxuq, ids } = await setup();
    await expectError(
      cxuq.query(api.members.list, { workspaceId: ids.personalWs }),
      "NOT_FOUND",
    );
    const team = await cxuq.query(api.members.list, { workspaceId: ids.teamWs });
    expectNoPrivateData(team, [ids.personalWs, ids.personalRoot, ids.personalChild]);
  });

  test("回收站里的团队节点对任何人都视为不存在", async () => {
    const { t, cxuq, ids } = await setup();
    await t.run((ctx) => ctx.db.patch(ids.teamChild, { deletedAt: Date.now() }));
    await expectError(
      cxuq.query(api.nodes.get, { nodeId: ids.teamChild }),
      "NOT_FOUND",
    );
    const children = await cxuq.query(api.nodes.listChildren, {
      parentId: ids.teamRoot,
    });
    expect(children).toEqual([]);
  });
  test("用 cxuq 的 API token（MCP 入口）：私人节点 NOT_FOUND，Viewer 里没有私人空间", async () => {
    const { t, ids } = await setup();
    const { token } = await t.action(internal.apiTokens.issue, {
      email: CXUQ.email,
      name: "mcp",
    });
    const hasPersonal = await t.run(async (ctx) =>
      (await getViewerFromApiToken(ctx, token)).workspaceIds.has(ids.personalWs),
    );
    expect(hasPersonal).toBe(false);
    for (const nodeId of [ids.personalRoot, ids.personalChild]) {
      await expectError(
        t.run(async (ctx) => {
          const viewer = await getViewerFromApiToken(ctx, token);
          return (await assertNode(ctx, viewer, nodeId)).title;
        }),
        "NOT_FOUND",
      );
    }
    const team = await t.run(async (ctx) => {
      const viewer = await getViewerFromApiToken(ctx, token);
      return { title: (await assertNode(ctx, viewer, ids.teamChild)).title };
    });
    expectNoPrivateData({ title: team.title }, [ids.personalRoot, ids.personalChild]);
  });
});

describe("你本人能看到完整的树", () => {
  test("EverHarvest 根节点保留私人父节点", async () => {
    const { lyc, ids } = await setup();
    const root = await lyc.query(api.nodes.get, { nodeId: ids.teamRoot });
    expect(root.parentId).toBe(ids.personalRoot);
    expect(root.ancestorIds).toEqual([ids.personalRoot]);
    expect(root.depth).toBe(1);
  });

  test("私人根节点下同时列出私人子节点和 EverHarvest", async () => {
    const { lyc, ids } = await setup();
    const children = await lyc.query(api.nodes.listChildren, {
      parentId: ids.personalRoot,
    });
    expect(new Set(children.map((c) => c._id))).toEqual(
      new Set([ids.personalChild, ids.teamRoot]),
    );
  });
});

describe("界面偏好（prefs）", () => {
  test("prefs.get 只读自己的设置：LYC 改了语言，cxuq 读到的仍是自己的", async () => {
    const { lyc, cxuq, ids } = await setup();
    await lyc.mutation(api.prefs.setLocale, { locale: "en" });
    expect(await lyc.query(api.prefs.get, {})).toEqual({ locale: "en" });
    const theirs = await cxuq.query(api.prefs.get, {});
    expect(theirs).toEqual({ locale: null });
    expectNoPrivateData(theirs, [ids.personalWs, ids.personalRoot, ids.personalChild]);
    await cxuq.mutation(api.prefs.setLocale, { locale: "zh-CN" });
    expect(await lyc.query(api.prefs.get, {})).toEqual({ locale: "en" });
  });
});

describe("未登录和非成员", () => {
  test("未登录调用任何函数都抛 UNAUTHENTICATED", async () => {
    const { t, ids } = await setup();
    await expectError(t.query(api.viewer.me, {}), "UNAUTHENTICATED");
    await expectError(
      t.query(api.nodes.get, { nodeId: ids.teamRoot }),
      "UNAUTHENTICATED",
    );
  });

  test("登录但没有成员资格：什么都看不到", async () => {
    const { stranger, ids } = await setup();
    const me = await stranger.query(api.viewer.me, {});
    expect(me.workspaces).toEqual([]);
    for (const nodeId of [ids.personalRoot, ids.teamRoot, ids.teamChild]) {
      await expectError(stranger.query(api.nodes.get, { nodeId }), "NOT_FOUND");
    }
  });
});
