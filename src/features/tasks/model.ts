import type { Status } from "@/features/outline/tree";

/**
 * 多维表格的纯函数（不依赖 React，方便测试）：预设视图、筛选、排序、分组、相对日期。
 * 数据来自 convex/tasks.ts 的 list；示例页用同样形状的内存数据。
 */
export type { Status };
export type Priority = "p0" | "p1" | "p2";

export type Ref = { linkId?: string; _id: string; title: string; status?: Status };

export type Task = {
  _id: string;
  parentId?: string;
  title: string;
  type: string;
  workspaceId: string;
  status: Status;
  assigneeId?: string;
  priority?: Priority;
  startDate?: string;
  dueDate?: string;
  completedAt?: number;
  estimatedHours?: number;
  actualHours?: number;
  notes?: string;
  createdAt: number;
  project: Ref | null;
  dependsOn: Ref[];
  blocking: Ref[];
  openDeps: number;
};

export type Person = { userId: string; email: string; workspaceIds: string[]; isMe: boolean };

/** 指派给 AI 的固定值（与 convex/nodes.ts 的 AI_ASSIGNEE 一致） */
export const AI_ASSIGNEE = "ai";

/** 按状态排序的自定义顺序（CLAUDE.md：In Progress → Blocked → Pending → Done → Backlog） */
export const STATUS_ORDER: Status[] = ["in_progress", "blocked", "pending", "done", "backlog", "cancelled"];
export const PRIORITIES: Priority[] = ["p0", "p1", "p2"];

export type GroupBy = "assignee" | "status" | "workspace" | "priority" | "project" | "none";
export type SortKey = "status" | "priority" | "dueDate" | "startDate" | "title" | "recent";

export type ViewKind = "table" | "board";
export type PresetId = "all" | "board" | "ai" | "done" | "deps";

export type Preset = {
  id: PresetId;
  kind: ViewKind;
  filter: (t: Task) => boolean;
  sort: SortKey[];
  group: GroupBy;
  /** 看板的子分组（每一列里再按它分段） */
  subGroup?: GroupBy;
};

const open = (t: Task) => t.status !== "done" && t.status !== "cancelled";

/** 对照 LYC 的 Notion Tasks 复刻的视图（时间线、待写日历在阶段 3 / 6） */
export const PRESETS: Preset[] = [
  { id: "all", kind: "table", filter: () => true, sort: ["status", "priority", "dueDate"], group: "assignee" },
  { id: "board", kind: "board", filter: open, sort: ["priority", "dueDate"], group: "assignee", subGroup: "status" },
  { id: "ai", kind: "table", filter: (t) => t.assigneeId === AI_ASSIGNEE && open(t), sort: ["priority", "dueDate"], group: "none" },
  {
    id: "done",
    kind: "table",
    filter: (t) => t.status === "done",
    sort: ["recent"],
    group: "none",
  },
  {
    id: "deps",
    kind: "table",
    filter: (t) => open(t) && (t.dependsOn.length > 0 || t.blocking.length > 0),
    sort: ["status", "priority"],
    group: "project",
  },
];

function cmp(a: Task, b: Task, key: SortKey): number {
  switch (key) {
    case "status":
      return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    case "priority":
      // 没有优先级排最后
      return (a.priority ? PRIORITIES.indexOf(a.priority) : 9) - (b.priority ? PRIORITIES.indexOf(b.priority) : 9);
    case "dueDate":
    case "startDate": {
      const x = a[key];
      const y = b[key];
      if (x === y) return 0;
      if (!x) return 1;
      if (!y) return -1;
      return x < y ? -1 : 1;
    }
    case "title":
      return a.title.localeCompare(b.title);
    case "recent":
      // 最近完成 / 最近创建的在前
      return (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt);
  }
}

export function sortTasks(tasks: readonly Task[], keys: readonly SortKey[]): Task[] {
  return [...tasks].sort((a, b) => {
    for (const k of keys) {
      const c = cmp(a, b, k);
      if (c !== 0) return c;
    }
    return a.createdAt - b.createdAt;
  });
}

/** 分组的键；没有值的统一用 "" */
export function groupKey(t: Task, by: GroupBy): string {
  switch (by) {
    case "assignee":
      return t.assigneeId ?? "";
    case "status":
      return t.status;
    case "workspace":
      return t.workspaceId;
    case "priority":
      return t.priority ?? "";
    case "project":
      return t.project?._id ?? "";
    case "none":
      return "";
  }
}

export type Group = { key: string; tasks: Task[] };

/**
 * 分组并保持组内顺序。组的顺序：状态 / 优先级按固定顺序，其他按第一次出现，「没有值」放最后。
 */
export function groupTasks(tasks: readonly Task[], by: GroupBy, order?: readonly string[]): Group[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = groupKey(t, by);
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  const fixed = by === "status" ? STATUS_ORDER : by === "priority" ? PRIORITIES : order;
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    if (!fixed) return 0;
    const ia = fixed.indexOf(a as never);
    const ib = fixed.indexOf(b as never);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return keys.map((key) => ({ key, tasks: map.get(key)! }));
}

export function applyPreset(tasks: readonly Task[], preset: Preset, workspaceFilter: string | null): Task[] {
  const rows = tasks.filter((t) => (workspaceFilter ? t.workspaceId === workspaceFilter : true) && preset.filter(t));
  return sortTasks(rows, preset.sort);
}

/** 本地日期（YYYY-MM-DD）之间相差的天数 */
export function dayDiff(date: string, today: string): number {
  const a = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

export function todayString(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function dateString(ms: number): string {
  return todayString(new Date(ms));
}

/** 前后 5 天内显示相对日期（CLAUDE.md），否则显示日期；返回的是要翻译的种类 + 天数 */
export type RelativeDate =
  | { kind: "today" }
  | { kind: "ago"; days: number }
  | { kind: "in"; days: number }
  | { kind: "date"; date: string };

export function relativeDate(date: string, today: string): RelativeDate {
  const d = dayDiff(date, today);
  if (d === 0) return { kind: "today" };
  if (d < 0 && d >= -5) return { kind: "ago", days: -d };
  if (d > 0 && d <= 5) return { kind: "in", days: d };
  return { kind: "date", date };
}

/** 显示名：邮箱 @ 前面的部分 */
export function personName(email: string): string {
  return email.split("@")[0];
}
