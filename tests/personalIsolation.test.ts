import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { assertNode, getViewerFromApiToken } from "../convex/lib/access";
import {
  CXUQ,
  SECRET,
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

describe("大纲读写（nodes.outline / create / update / move / remove / restore）", () => {
  test("nodes.outline：cxuq 拿到的树里没有任何私人内容和私人 id", async () => {
    const { cxuq, ids } = await setup();
    const tree = await cxuq.query(api.nodes.outline, {});
    expectNoPrivateData(tree, [ids.personalWs, ids.personalRoot, ids.personalChild]);
  });

  test("cxuq 不能在私人节点下新建、不能改 / 移动 / 删除私人节点：一律 NOT_FOUND", async () => {
    const { cxuq, ids } = await setup();
    await expectError(cxuq.mutation(api.nodes.create, { parentId: ids.personalRoot, title: "x" }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.nodes.create, { parentId: ids.personalChild, title: "x" }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.nodes.update, { nodeId: ids.personalChild, title: "x" }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.nodes.update, { nodeId: ids.personalRoot, status: "done" }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.nodes.move, { nodeId: ids.personalChild, parentId: ids.teamRoot }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.nodes.remove, { nodeId: ids.personalChild }), "NOT_FOUND");
    // 把 EverHarvest 的节点挪到私人节点下面也不行（目标父节点读不到）
    await expectError(cxuq.mutation(api.nodes.move, { nodeId: ids.teamChild, parentId: ids.personalRoot }), "NOT_FOUND");
  });

  test("回收站里的私人节点：cxuq 恢复不了，也分辨不出它存在", async () => {
    const { lyc, cxuq, ids } = await setup();
    await lyc.mutation(api.nodes.remove, { nodeId: ids.personalChild });
    await expectError(cxuq.mutation(api.nodes.restore, { nodeId: ids.personalChild }), "NOT_FOUND");
    // 没删除的私人节点也是同一个错误
    await expectError(cxuq.mutation(api.nodes.restore, { nodeId: ids.personalRoot }), "NOT_FOUND");
  });

  test("cxuq 改 EverHarvest 状态会更新 LYC 私人根的汇总，但 cxuq 读不到这个汇总", async () => {
    const { lyc, cxuq, ids } = await setup();
    await cxuq.mutation(api.nodes.update, { nodeId: ids.teamChild, status: "done" });
    expect((await lyc.query(api.nodes.get, { nodeId: ids.personalRoot })).rollup).toEqual({ done: 1, total: 1 });
    const tree = await cxuq.query(api.nodes.outline, {});
    expectNoPrivateData(tree, [ids.personalWs, ids.personalRoot, ids.personalChild]);
  });
});

describe("多维表格（tasks.list / people / projects / links）", () => {
  /** 私人项目（含哨兵）→ 私人任务；EverHarvest 任务依赖私人任务（LYC 两边都是成员，可以连） */
  async function tableSetup() {
    const s = await setup();
    const { lyc, ids } = s;
    const personalProject = await lyc.mutation(api.nodes.create, {
      parentId: ids.personalRoot,
      title: `求职 ${SECRET}`,
      type: "project",
    });
    const personalTask = await lyc.mutation(api.nodes.create, {
      parentId: personalProject,
      title: `投简历 ${SECRET}`,
      type: "task",
      status: "pending",
    });
    await lyc.mutation(api.nodes.update, { nodeId: ids.personalChild, status: "in_progress" });
    await lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, status: "pending" });
    const crossLink = await lyc.mutation(api.links.addDependency, { fromId: ids.teamChild, toId: personalTask });
    await lyc.mutation(api.links.addDependency, { fromId: personalTask, toId: ids.teamChild }).catch(() => undefined);
    const privateIds = [ids.personalWs, ids.personalRoot, ids.personalChild, personalProject, personalTask, crossLink];
    return { ...s, personalProject, personalTask, crossLink, privateIds };
  }

  test("tasks.list：cxuq 只拿到 EverHarvest 的行，依赖里也看不到私人任务", async () => {
    const { lyc, cxuq, ids, privateIds } = await tableSetup();
    const rows = await cxuq.query(api.tasks.list, {});
    expect(rows.map((r) => r._id)).toEqual([ids.teamChild]);
    expect(rows[0].dependsOn).toEqual([]);
    expect(rows[0].openDeps).toBe(0);
    expect(rows[0].parentId).toBe(ids.teamRoot);
    expectNoPrivateData(rows, privateIds);
    // LYC 在同一个接口里看到两个空间的全部任务
    const mine = await lyc.query(api.tasks.list, {});
    expect(mine.length).toBe(3);
    expect(mine.find((r) => r._id === ids.teamChild)!.openDeps).toBe(1);
  });

  test("tasks.people / tasks.projects：cxuq 看不到私人空间", async () => {
    const { cxuq, ids, privateIds } = await tableSetup();
    const people = await cxuq.query(api.tasks.people, {});
    expect(people.every((p) => p.workspaceIds.every((w) => w === ids.teamWs))).toBe(true);
    expectNoPrivateData(people, privateIds);
    await expectError(cxuq.query(api.tasks.projects, { workspaceId: ids.personalWs }), "NOT_FOUND");
    expectNoPrivateData(await cxuq.query(api.tasks.projects, { workspaceId: ids.teamWs }), privateIds);
  });

  test("links：cxuq 不能连到私人任务，也不能删跨空间的连线", async () => {
    const { cxuq, ids, personalTask, crossLink } = await tableSetup();
    await expectError(cxuq.mutation(api.links.addDependency, { fromId: ids.teamChild, toId: personalTask }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.links.addDependency, { fromId: personalTask, toId: ids.teamChild }), "NOT_FOUND");
    await expectError(cxuq.mutation(api.links.remove, { linkId: crossLink }), "NOT_FOUND");
  });

  test("指派：私人任务不能指给不在私人空间的人", async () => {
    const { lyc, ids, personalTask } = await tableSetup();
    await expect(
      lyc.mutation(api.nodes.update, { nodeId: personalTask, assigneeId: CXUQ.subject }),
    ).rejects.toThrow(/INVALID_ASSIGNEE/);
    await lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, assigneeId: CXUQ.subject });
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
