import { describe, expect, test } from "vitest";
import { applyStatusChange } from "../convex/lib/status";

const T1 = 1_000;
const T2 = 2_000;

describe("状态时间戳", () => {
  test("变成 in_progress 写 startedAt", () => {
    const r = applyStatusChange({ status: "pending" }, "in_progress", T1);
    expect(r).toEqual({ status: "in_progress", startedAt: T1, completedAt: undefined });
  });

  test("再次进入 in_progress 保留第一次的 startedAt", () => {
    const r = applyStatusChange({ status: "pending", startedAt: T1 }, "in_progress", T2);
    expect(r.startedAt).toBe(T1);
  });

  test("变成 done 写 completedAt", () => {
    const r = applyStatusChange({ status: "in_progress", startedAt: T1 }, "done", T2);
    expect(r).toEqual({ status: "done", startedAt: T1, completedAt: T2 });
  });

  test("done 再设为 done 不改 completedAt", () => {
    const r = applyStatusChange({ status: "done", completedAt: T1 }, "done", T2);
    expect(r.completedAt).toBe(T1);
  });

  test("从 done 改回去清空 completedAt", () => {
    for (const next of ["in_progress", "pending", "backlog", "cancelled", undefined] as const) {
      const r = applyStatusChange({ status: "done", startedAt: T1, completedAt: T2 }, next, 3_000);
      expect(r.completedAt).toBeUndefined();
      expect(r.status).toBe(next);
    }
  });
});
