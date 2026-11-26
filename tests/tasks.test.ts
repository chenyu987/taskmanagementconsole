import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { LYC, setup } from "./fixtures";

describe("tasks / links", () => {
  test("任务列表：字段、所属项目、依赖和未完成依赖数", async () => {
    const { lyc, ids } = await setup();
    const project = await lyc.mutation(api.nodes.create, { parentId: ids.teamRoot, title: "雪季", type: "project" });
    const a = await lyc.mutation(api.nodes.create, { parentId: project, title: "A", type: "task", status: "pending", priority: "p0", assigneeId: LYC.subject });
    const b = await lyc.mutation(api.nodes.create, { parentId: project, title: "B", type: "task", status: "in_progress" });
    const link = await lyc.mutation(api.links.addDependency, { fromId: a, toId: b });
    // 重复连线不会多一条；反向连线（直接成环）被拒
    expect(await lyc.mutation(api.links.addDependency, { fromId: a, toId: b })).toBe(link);
    await expect(lyc.mutation(api.links.addDependency, { fromId: b, toId: a })).rejects.toThrow(/INVALID_LINK/);
    await expect(lyc.mutation(api.links.addDependency, { fromId: a, toId: a })).rejects.toThrow(/INVALID_LINK/);

    let rows = await lyc.query(api.tasks.list, {});
    const ra = rows.find((r) => r._id === a)!;
    expect(ra).toMatchObject({ title: "A", status: "pending", priority: "p0", assigneeId: LYC.subject, openDeps: 1 });
    expect(ra.project?._id).toBe(project);
    expect(ra.dependsOn.map((d) => d._id)).toEqual([b]);
    expect(rows.find((r) => r._id === b)!.blocking.map((d) => d._id)).toEqual([a]);
    // 没有状态的节点（项目）不在任务列表里
    expect(rows.some((r) => r._id === project)).toBe(false);

    await lyc.mutation(api.nodes.update, { nodeId: b, status: "done" });
    rows = await lyc.query(api.tasks.list, {});
    expect(rows.find((r) => r._id === a)!.openDeps).toBe(0);
    expect(rows.find((r) => r._id === b)!.completedAt).toBeTypeOf("number");

    await lyc.mutation(api.links.remove, { linkId: link });
    rows = await lyc.query(api.tasks.list, {});
    expect(rows.find((r) => r._id === a)!.dependsOn).toEqual([]);
  });

  test("指派给 AI、写备注、删除的任务不再出现", async () => {
    const { lyc, ids } = await setup();
    await lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, status: "pending", assigneeId: "ai", notes: "n" });
    let rows = await lyc.query(api.tasks.list, {});
    expect(rows.find((r) => r._id === ids.teamChild)).toMatchObject({ assigneeId: "ai", notes: "n" });
    await lyc.mutation(api.nodes.update, { nodeId: ids.teamChild, assigneeId: null, notes: null });
    rows = await lyc.query(api.tasks.list, {});
    expect(rows.find((r) => r._id === ids.teamChild)!.assigneeId).toBeUndefined();
    await lyc.mutation(api.nodes.remove, { nodeId: ids.teamChild });
    rows = await lyc.query(api.tasks.list, {});
    expect(rows.some((r) => r._id === ids.teamChild)).toBe(false);
  });
});
