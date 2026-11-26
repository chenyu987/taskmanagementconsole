import { useMemo, useState } from "react";
import { TasksView, type TaskPatch, type TasksActions } from "@/features/tasks/TasksView";
import { AI_ASSIGNEE, type Person, type Task } from "@/features/tasks/model";

/**
 * 设计确认 / 截图用：多维表格的样例数据，写操作在内存里完成（可以真的改状态、拖卡片）。
 * 打开方式：本地 /?preview=tasks（固定「今天」= 2026-11-25，截图稳定）
 */
const TODAY = "2026-11-25";
const P = "p";
const E = "e";
const WORKSPACES = [
  { _id: P, name: "私人" },
  { _id: E, name: "EverHarvest" },
];
const PEOPLE: Person[] = [
  { userId: "lyc", email: "lyc@example.com", workspaceIds: [P, E], isMe: true },
  { userId: "team", email: "team@example.com", workspaceIds: [E], isMe: false },
];
const season = { _id: "season", title: "2026–27 雪季上架" };
const job = { _id: "job", title: "求职" };

type Seed = Partial<Task> & Pick<Task, "_id" | "title" | "workspaceId" | "status">;
const SEED: Seed[] = [
  { _id: "ikon", title: "更新 Ikon Pass 价格表", workspaceId: E, status: "in_progress", assigneeId: "team", priority: "p0", startDate: "2026-11-23", dueDate: "2026-11-26", estimatedHours: 3, actualHours: 2, project: season },
  { _id: "epic", title: "确认 Epic Pass 团购报价", workspaceId: E, status: "blocked", assigneeId: "lyc", priority: "p0", dueDate: "2026-11-24", estimatedHours: 1, project: season, notes: "等 Vail 回邮件" },
  { _id: "listing", title: "上架页面文案（中英文）", workspaceId: E, status: "pending", assigneeId: "team", priority: "p1", dueDate: "2026-11-28", estimatedHours: 2, project: season },
  { _id: "refund", title: "退款政策写清楚", workspaceId: E, status: "pending", assigneeId: "lyc", priority: "p2", dueDate: "2026-12-05", estimatedHours: 1.5, project: season },
  { _id: "faq", title: "整理客服常见问题", workspaceId: E, status: "pending", assigneeId: AI_ASSIGNEE, priority: "p1", estimatedHours: 1, project: season },
  { _id: "price-scan", title: "每天比对各渠道雪票价格", workspaceId: E, status: "in_progress", assigneeId: AI_ASSIGNEE, priority: "p2" },
  { _id: "cs", title: "回复退款邮件", workspaceId: E, status: "done", assigneeId: "team", completedAt: Date.UTC(2026, 10, 24, 4), estimatedHours: 0.5, actualHours: 0.5 },
  { _id: "resume", title: "更新简历", workspaceId: P, status: "in_progress", assigneeId: "lyc", priority: "p1", startDate: "2026-11-24", dueDate: "2026-11-27", estimatedHours: 2, project: job },
  { _id: "apply", title: "投三家公司", workspaceId: P, status: "pending", assigneeId: "lyc", priority: "p1", dueDate: "2026-11-30", project: job },
  { _id: "run", title: "每周跑步 3 次", workspaceId: P, status: "in_progress", assigneeId: "lyc", priority: "p2" },
  { _id: "checkup", title: "预约年度体检", workspaceId: P, status: "done", assigneeId: "lyc", completedAt: Date.UTC(2026, 10, 22, 4) },
  { _id: "golf", title: "约一场 17 Mile Drive 的高尔夫", workspaceId: P, status: "backlog" },
];
const DEPS: [from: string, to: string][] = [
  ["listing", "ikon"],
  ["listing", "epic"],
  ["apply", "resume"],
];

let counter = 0;

function derive(base: Seed[], deps: { id: string; from: string; to: string }[]): Task[] {
  const byId = new Map(base.map((t) => [t._id, t]));
  const ref = (id: string, linkId: string) => {
    const t = byId.get(id)!;
    return { linkId, _id: id, title: t.title, status: t.status };
  };
  return base.map((t) => {
    const dependsOn = deps.filter((d) => d.from === t._id).map((d) => ref(d.to, d.id));
    const blocking = deps.filter((d) => d.to === t._id).map((d) => ref(d.from, d.id));
    return {
      type: "task",
      createdAt: 0,
      project: null,
      ...t,
      dependsOn,
      blocking,
      openDeps: dependsOn.filter((d) => d.status !== "done" && d.status !== "cancelled").length,
    };
  });
}

export default function TasksPreview() {
  const [rows, setRows] = useState<Seed[]>(SEED.map((s, i) => ({ ...s, createdAt: i })));
  const [deps, setDeps] = useState(DEPS.map(([from, to], i) => ({ id: `l${i}`, from, to })));
  const tasks = useMemo(() => derive(rows, deps), [rows, deps]);

  const actions: TasksActions = {
    update: async (id, patch: TaskPatch) => {
      setRows((rs) =>
        rs.map((r) => {
          if (r._id !== id) return r;
          const next: Seed = { ...r };
          for (const [k, v] of Object.entries(patch)) (next as Record<string, unknown>)[k] = v ?? undefined;
          if (patch.status === "done" && r.status !== "done") next.completedAt = Date.UTC(2026, 10, 25, 4);
          if (patch.status && patch.status !== "done") next.completedAt = undefined;
          return next;
        }),
      );
    },
    create: async (workspaceId, title, patch) => {
      counter += 1;
      setRows((rs) => [
        { _id: `new-${counter}`, title, workspaceId, status: patch.status ?? "pending", assigneeId: patch.assigneeId ?? undefined, createdAt: 100 + counter },
        ...rs,
      ]);
    },
    addDependency: async (from, to) => {
      counter += 1;
      setDeps((ds) => [...ds, { id: `l-new-${counter}`, from, to }]);
    },
    removeDependency: async (linkId) => {
      setDeps((ds) => ds.filter((d) => d.id !== linkId));
    },
  };

  return <TasksView tasks={tasks} people={PEOPLE} workspaces={WORKSPACES} actions={actions} onBack={() => undefined} today={TODAY} />;
}
