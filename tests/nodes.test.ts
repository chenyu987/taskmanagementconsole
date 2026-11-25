import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { setup } from "./fixtures";

async function errCode(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? String((e as Error).message).match(/"code":"(\w+)"/)?.[1];
  }
  return "OK";
}

describe("大纲编辑", () => {
  test("新建：归属父节点的工作区，排序键按位置生成", async () => {
    const { t, lyc, ids } = await setup();
    const a = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "A" });
    const c = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "C" });
    const b = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "B", afterId: a });
    const first = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "0", afterId: null });
    const kids = await lyc.query(api.nodes.listChildren, { parentId: ids.teamChild });
    expect(kids.map((k) => k.title)).toEqual(["0", "A", "B", "C"]);
    const docB = await t.run((ctx) => ctx.db.get(b));
    expect(docB!.workspaceId).toBe(ids.teamWs);
    expect(docB!.ancestorIds.at(-1)).toBe(ids.teamChild);
    expect(docB!.path.endsWith(`${ids.teamChild}/${b}/`)).toBe(true);
    expect([a, c, first]).toHaveLength(3);
  });

  test("缩进 / 反缩进：整棵子树的 path、ancestorIds、depth 一起改", async () => {
    const { t, lyc, ids } = await setup();
    const a = await lyc.mutation(api.nodes.create, { parentId: ids.teamRoot, title: "A" });
    const a1 = await lyc.mutation(api.nodes.create, { parentId: a, title: "A1" });
    const a11 = await lyc.mutation(api.nodes.create, { parentId: a1, title: "A11" });
    // A 缩进到「雪票采购」下面
    await lyc.mutation(api.nodes.move, { nodeId: a, parentId: ids.teamChild });
    const [dA, dA11, dParent] = await t.run(async (ctx) => [
      await ctx.db.get(a),
      await ctx.db.get(a11),
      await ctx.db.get(ids.teamChild),
    ]);
    expect(dA!.parentId).toBe(ids.teamChild);
    expect(dA11!.ancestorIds).toEqual([...dParent!.ancestorIds, ids.teamChild, a, a1]);
    expect(dA11!.path).toBe(`${dParent!.path}${a}/${a1}/${a11}/`);
    expect(dA11!.depth).toBe(dParent!.depth + 3);
    // 再反缩进回 EverHarvest 根，排在「雪票采购」后面
    await lyc.mutation(api.nodes.move, { nodeId: a, parentId: ids.teamRoot, afterId: ids.teamChild });
    const kids = await lyc.query(api.nodes.listChildren, { parentId: ids.teamRoot });
    expect(kids.map((k) => k._id)).toEqual([ids.teamChild, a]);
    const back = await t.run((ctx) => ctx.db.get(a11));
    expect(back!.depth).toBe(dParent!.depth + 2); // 少了一层「雪票采购」
  });

  test("移动的限制：根节点、跨工作区、移到自己下面", async () => {
    const { lyc, ids } = await setup();
    const a = await lyc.mutation(api.nodes.create, { parentId: ids.teamRoot, title: "A" });
    const a1 = await lyc.mutation(api.nodes.create, { parentId: a, title: "A1" });
    expect(await errCode(lyc.mutation(api.nodes.move, { nodeId: ids.teamRoot, parentId: ids.personalChild }))).toBe("ROOT_LOCKED");
    // 私人节点不能挂进 EverHarvest（否则 cxuq 会看到）
    expect(await errCode(lyc.mutation(api.nodes.move, { nodeId: ids.personalChild, parentId: ids.teamChild }))).toBe("CROSS_WORKSPACE");
    expect(await errCode(lyc.mutation(api.nodes.move, { nodeId: a, parentId: a1 }))).toBe("INVALID_MOVE");
    expect(await errCode(lyc.mutation(api.nodes.move, { nodeId: a, parentId: a }))).toBe("INVALID_MOVE");
  });

  test("改状态：写 startedAt / completedAt，进度沿祖先链汇总", async () => {
    const { t, lyc, ids } = await setup();
    const a = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "A" });
    const b = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "B" });
    await lyc.mutation(api.nodes.update, { nodeId: a, status: "in_progress" });
    await lyc.mutation(api.nodes.update, { nodeId: b, status: "pending" });
    const rollups = async () =>
      t.run(async (ctx) => ({
        child: (await ctx.db.get(ids.teamChild))!.rollup,
        teamRoot: (await ctx.db.get(ids.teamRoot))!.rollup,
        personalRoot: (await ctx.db.get(ids.personalRoot))!.rollup,
      }));
    expect(await rollups()).toEqual({
      child: { done: 0, total: 2 },
      teamRoot: { done: 0, total: 2 },
      personalRoot: { done: 0, total: 2 },
    });
    await lyc.mutation(api.nodes.update, { nodeId: a, status: "done" });
    const docA = await t.run((ctx) => ctx.db.get(a));
    expect(docA!.startedAt).toBeTypeOf("number");
    expect(docA!.completedAt).toBeTypeOf("number");
    expect((await rollups()).personalRoot).toEqual({ done: 1, total: 2 });
    // cancelled 不计入；清空状态也不计入
    await lyc.mutation(api.nodes.update, { nodeId: b, status: "cancelled" });
    expect((await rollups()).child).toEqual({ done: 1, total: 1 });
    await lyc.mutation(api.nodes.update, { nodeId: a, status: null });
    expect((await rollups()).child).toBeUndefined();
  });

  test("其他字段：优先级、日期、工时；非法值被拒绝", async () => {
    const { t, lyc, ids } = await setup();
    await lyc.mutation(api.nodes.update, {
      nodeId: ids.teamChild,
      title: "雪票采购（改）",
      type: "project",
      priority: "p0",
      dueDate: "2026-12-01",
      actualHours: 3.5,
      status: "blocked",
    });
    const d = await t.run((ctx) => ctx.db.get(ids.teamChild));
    expect(d).toMatchObject({ title: "雪票采购（改）", type: "project", priority: "p0", dueDate: "2026-12-01", actualHours: 3.5, status: "blocked" });
    await lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, priority: null });
    expect((await t.run((ctx) => ctx.db.get(ids.teamChild)))!.priority).toBeUndefined();
    expect(await errCode(lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, dueDate: "12/01" }))).toBe("INVALID_DATE");
    expect(await errCode(lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, actualHours: -1 }))).toBe("INVALID_HOURS");
  });

  test("删除进回收站，整棵子树一起；恢复也一起；根节点不能删", async () => {
    const { lyc, ids } = await setup();
    const a = await lyc.mutation(api.nodes.create, { parentId: ids.teamChild, title: "A" });
    const a1 = await lyc.mutation(api.nodes.create, { parentId: a, title: "A1" });
    await lyc.mutation(api.nodes.update, { nodeId: a1, status: "done" });
    await lyc.mutation(api.nodes.remove, { nodeId: a });
    expect(await errCode(lyc.query(api.nodes.get, { nodeId: a1 }))).toBe("NOT_FOUND");
    const outline = await lyc.query(api.nodes.outline, {});
    expect(outline.nodes.map((n) => n._id)).not.toContain(a1);
    expect((await lyc.query(api.nodes.get, { nodeId: ids.teamChild })).rollup).toBeUndefined();

    await lyc.mutation(api.nodes.restore, { nodeId: a });
    expect((await lyc.query(api.nodes.get, { nodeId: a1 })).title).toBe("A1");
    expect((await lyc.query(api.nodes.get, { nodeId: ids.teamChild })).rollup).toEqual({ done: 1, total: 1 });

    expect(await errCode(lyc.mutation(api.nodes.remove, { nodeId: ids.teamRoot }))).toBe("ROOT_LOCKED");
    expect(await errCode(lyc.mutation(api.nodes.remove, { nodeId: ids.personalRoot }))).toBe("ROOT_LOCKED");
  });

  test("大纲：LYC 从「人生」看到全部，cxuq 从 EverHarvest 根开始", async () => {
    const { lyc, cxuq, ids } = await setup();
    const mine = await lyc.query(api.nodes.outline, {});
    expect(mine.rootIds).toEqual([ids.personalRoot]);
    expect(new Set(mine.nodes.map((n) => n._id))).toEqual(
      new Set<Id<"nodes">>([ids.personalRoot, ids.personalChild, ids.teamRoot, ids.teamChild]),
    );
    const theirs = await cxuq.query(api.nodes.outline, {});
    expect(theirs.rootIds).toEqual([ids.teamRoot]);
    expect(theirs.nodes.map((n) => n._id).sort()).toEqual([ids.teamRoot, ids.teamChild].sort());
    const root = theirs.nodes.find((n) => n._id === ids.teamRoot)!;
    expect(root.parentId).toBeUndefined();
    expect(root.depth).toBe(0);
  });

  test("成员（cxuq）可以编辑 EverHarvest", async () => {
    const { cxuq, ids } = await setup();
    const a = await cxuq.mutation(api.nodes.create, { parentId: ids.teamChild, title: "cxuq 的任务" });
    await cxuq.mutation(api.nodes.update, { nodeId: a, status: "done" });
    await cxuq.mutation(api.nodes.move, { nodeId: a, parentId: ids.teamRoot });
    await cxuq.mutation(api.nodes.remove, { nodeId: a });
    await cxuq.mutation(api.nodes.restore, { nodeId: a });
  });
});
