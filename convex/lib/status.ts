import type { Doc } from "../_generated/dataModel";

type Status = NonNullable<Doc<"nodes">["status"]>;

export type StatusPatch = {
  status: Status | undefined;
  startedAt: number | undefined;
  completedAt: number | undefined;
};

/**
 * 状态变化时自动维护 startedAt / completedAt。所有改状态的入口都必须用它，客户端不能直接写这两个字段。
 * - 变成 in_progress：写 startedAt；已有则保留第一次的值
 * - 变成 done：写 completedAt
 * - 不再是 done：清空 completedAt
 */
export function applyStatusChange(
  prev: Pick<Doc<"nodes">, "status" | "startedAt" | "completedAt">,
  next: Status | undefined,
  now: number,
): StatusPatch {
  let startedAt = prev.startedAt;
  let completedAt = prev.completedAt;
  if (next === "in_progress" && startedAt === undefined) startedAt = now;
  if (next === "done") {
    if (prev.status !== "done" || completedAt === undefined) completedAt = now;
  } else {
    completedAt = undefined;
  }
  return { status: next, startedAt, completedAt };
}
