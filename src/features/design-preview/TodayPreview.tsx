import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 阶段 1 第一步：今日视图示例页，用来确认设计系统（DESIGN.md）。
 * 样例数据写死在这里，不连后端。打开方式：/?preview=today
 *
 * 也演示了 LYC 的合并视图需求：私人和 EverHarvest 的任务在同一个列表里，每行标出空间，可按空间筛选。
 */

type Space = "私人" | "EverHarvest";

type Task = {
  title: string;
  space: Space;
  path: string;
  due?: string;
  time?: string;
  assignee?: string;
  done?: boolean;
};

type Project = { title: string; space: Space; path: string; done: number; total: number };

const OVERDUE: Task[] = [
  {
    title: "确认 Epic Pass 团购报价",
    space: "EverHarvest",
    path: "雪票采购",
    due: "11/24",
    assignee: "cx",
  },
];

const TODAY: Task[] = [
  { title: "和 cxuq 过本周订单", space: "EverHarvest", path: "运营 › 周会", time: "10:00" },
  { title: "更新 Ikon Pass 价格表", space: "EverHarvest", path: "雪票采购", assignee: "cx" },
  { title: "跑步 5 公里", space: "私人", path: "健康", time: "18:30" },
  { title: "读完《穷查理宝典》第 3 章", space: "私人", path: "学习 › 读书" },
  { title: "回复 3 位客户的退款邮件", space: "EverHarvest", path: "客服", done: true },
  { title: "预约年度体检", space: "私人", path: "健康", done: true },
];

const PROJECTS: Project[] = [
  { title: "2026–27 雪季上架", space: "EverHarvest", path: "雪票采购", done: 7, total: 12 },
  { title: "人生操作系统 · 阶段 1", space: "私人", path: "工具", done: 2, total: 9 },
];

type Filter = "全部" | Space;

export default function TodayPreview() {
  const [filter, setFilter] = useState<Filter>("全部");

  const visible = <T extends { space: Space }>(items: T[]) =>
    filter === "全部" ? items : items.filter((t) => t.space === filter);

  const overdue = visible(OVERDUE);
  const today = visible(TODAY);
  const projects = visible(PROJECTS);
  const doneCount = today.filter((t) => t.done).length;

  return (
    <main className="mx-auto max-w-2xl px-6 pt-16 pb-24">
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">今天</h1>
          <p className="mt-1 text-sm text-ink-3">11 月 25 日 · 周三</p>
        </div>
        <nav className="flex gap-4 text-sm" aria-label="按空间筛选">
          {(["全部", "私人", "EverHarvest"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "transition-colors duration-150",
                filter === f ? "font-medium text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {f}
            </button>
          ))}
        </nav>
      </header>

      <p className="mt-10 font-display text-lg leading-relaxed text-ink-2">
        把 EverHarvest 做成不需要我也能运转的生意，留出时间给家人和身体。
      </p>

      <dl className="mt-10 grid grid-cols-3 gap-6 border-y border-line py-5">
        <Stat label="今天" value={today.length} />
        <Stat label="已完成" value={doneCount} />
        <Stat label="逾期" value={overdue.length} danger={overdue.length > 0} />
      </dl>

      {overdue.length > 0 && (
        <Section title="逾期">
          {overdue.map((t) => (
            <TaskRow key={t.title} task={t} overdue />
          ))}
        </Section>
      )}

      <Section title="今天要做">
        {today.map((t) => (
          <TaskRow key={t.title} task={t} />
        ))}
      </Section>

      <Section title="进行中的项目">
        {projects.map((p) => (
          <ProjectRow key={p.title} project={p} />
        ))}
      </Section>

    </main>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", danger ? "text-danger" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-xs font-medium text-ink-3">{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

function SpacePath({ space, path }: { space: Space; path: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-3">
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", space === "EverHarvest" ? "bg-accent" : "bg-ink-3")}
      />
      {space} › {path}
    </span>
  );
}

function TaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  return (
    <li className="group flex items-start gap-3 rounded-md px-2 py-2.5 -mx-2 transition-colors duration-150 hover:bg-line/50">
      <span
        aria-hidden
        className={cn(
          "mt-1 grid size-4 shrink-0 place-items-center rounded-full border",
          task.done ? "border-ink bg-ink text-canvas" : "border-ink-3",
        )}
      >
        {task.done && (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.2 5 8.5l4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-base leading-6", task.done ? "text-ink-3 line-through" : "text-ink")}>
          {task.title}
        </p>
        <SpacePath space={task.space} path={task.path} />
      </div>
      <div className="flex shrink-0 items-center gap-3 pt-0.5">
        {task.assignee && (
          <span className="grid size-6 place-items-center rounded-full border border-line text-xs font-medium text-ink-2">
            {task.assignee}
          </span>
        )}
        {(task.time ?? task.due) && (
          <span className={cn("font-mono text-xs tabular-nums", overdue ? "text-danger" : "text-ink-3")}>
            {task.time ?? task.due}
          </span>
        )}
      </div>
    </li>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const pct = Math.round((project.done / project.total) * 100);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-base font-medium text-ink">{project.title}</p>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          {project.done}/{project.total}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <SpacePath space={project.space} path={project.path} />
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
