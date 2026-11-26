import { describe, expect, test } from "vitest";
import { PRESETS, applyPreset, groupTasks, relativeDate, sortTasks, type Task } from "../src/features/tasks/model";

const base = (p: Partial<Task> & Pick<Task, "_id" | "status">): Task => ({
  title: p._id,
  type: "task",
  workspaceId: "w",
  createdAt: 0,
  project: null,
  dependsOn: [],
  blocking: [],
  openDeps: 0,
  ...p,
});

describe("多维表格的纯函数", () => {
  test("按状态的自定义顺序 + 优先级排序", () => {
    const rows = [
      base({ _id: "a", status: "backlog" }),
      base({ _id: "b", status: "done" }),
      base({ _id: "c", status: "pending", priority: "p2" }),
      base({ _id: "d", status: "pending", priority: "p0" }),
      base({ _id: "e", status: "blocked" }),
      base({ _id: "f", status: "in_progress" }),
    ];
    expect(sortTasks(rows, ["status", "priority"]).map((r) => r._id)).toEqual(["f", "e", "d", "c", "b", "a"]);
  });

  test("分组：按给定顺序，没有值的放最后", () => {
    const rows = [base({ _id: "a", status: "pending" }), base({ _id: "b", status: "pending", assigneeId: "x" }), base({ _id: "c", status: "pending", assigneeId: "me" })];
    expect(groupTasks(rows, "assignee", ["me", "x"]).map((g) => g.key)).toEqual(["me", "x", ""]);
  });

  test("预设视图：AI 待办只要指给 AI 且没完成的；空间筛选", () => {
    const rows = [
      base({ _id: "a", status: "pending", assigneeId: "ai" }),
      base({ _id: "b", status: "done", assigneeId: "ai" }),
      base({ _id: "c", status: "pending", assigneeId: "ai", workspaceId: "w2" }),
    ];
    const ai = PRESETS.find((p) => p.id === "ai")!;
    expect(applyPreset(rows, ai, null).map((r) => r._id)).toEqual(["a", "c"]);
    expect(applyPreset(rows, ai, "w2").map((r) => r._id)).toEqual(["c"]);
  });

  test("相对日期：前后 5 天内显示几天前 / 几天后", () => {
    expect(relativeDate("2026-11-25", "2026-11-25")).toEqual({ kind: "today" });
    expect(relativeDate("2026-11-20", "2026-11-25")).toEqual({ kind: "ago", days: 5 });
    expect(relativeDate("2026-11-30", "2026-11-25")).toEqual({ kind: "in", days: 5 });
    expect(relativeDate("2026-12-01", "2026-11-25")).toEqual({ kind: "date", date: "2026-12-01" });
    expect(relativeDate("2027-01-01", "2026-12-31")).toEqual({ kind: "in", days: 1 });
  });
});
