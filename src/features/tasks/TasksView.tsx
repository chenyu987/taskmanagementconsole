import { t as tGlobal } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronLeft, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorCode } from "@/lib/errorCode";
import { cn } from "@/lib/utils";
import {
  AI_ASSIGNEE,
  PRESETS,
  PRIORITIES,
  STATUS_ORDER,
  applyPreset,
  dateString,
  groupKey,
  groupTasks,
  personName,
  relativeDate,
  todayString,
  type GroupBy,
  type Person,
  type PresetId,
  type Priority,
  type Status,
  type Task,
} from "./model";

export type TaskPatch = {
  title?: string;
  status?: Status | null;
  assigneeId?: string | null;
  priority?: Priority | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  notes?: string | null;
};

/** 表格 / 看板的全部写操作。真数据页接 Convex，示例页接内存实现。失败时抛带 code 的错误。 */
export type TasksActions = {
  update: (id: string, patch: TaskPatch) => Promise<void>;
  create: (workspaceId: string, title: string, patch: TaskPatch) => Promise<void>;
  addDependency: (fromId: string, toId: string) => Promise<void>;
  removeDependency: (linkId: string) => Promise<void>;
};

export type Workspace = { _id: string; name: string };

function statusLabel(s: Status) {
  switch (s) {
    case "backlog":
      return tGlobal`以后再说`;
    case "pending":
      return tGlobal`待开始`;
    case "in_progress":
      return tGlobal`进行中`;
    case "blocked":
      return tGlobal`卡住了`;
    case "done":
      return tGlobal`完成`;
    case "cancelled":
      return tGlobal`取消`;
  }
}

/** 状态颜色只表达含义（DESIGN.md）：进行中 = accent，卡住 = danger，待开始 = warning，完成 = success */
const STATUS_DOT: Record<Status, string> = {
  backlog: "bg-ink-3",
  pending: "bg-warning",
  in_progress: "bg-accent",
  blocked: "bg-danger",
  done: "bg-success",
  cancelled: "bg-line",
};

const PRIORITY_TEXT: Record<Priority, string> = {
  p0: "text-danger",
  p1: "text-warning",
  p2: "text-ink-3",
};

function presetLabel(id: PresetId) {
  switch (id) {
    case "all":
      return tGlobal`全部任务`;
    case "board":
      return tGlobal`按人看板`;
    case "ai":
      return tGlobal`AI 待办`;
    case "done":
      return tGlobal`已完成`;
    case "deps":
      return tGlobal`依赖`;
  }
}

function tasksErrorText(code: string | undefined) {
  switch (code) {
    case "INVALID_ASSIGNEE":
      return tGlobal`这个人不在任务所在的空间里，不能指派。`;
    case "INVALID_LINK":
      return tGlobal`不能这样连：会让两个任务互相等待。`;
    case "TOO_LONG":
      return tGlobal`内容太长了。`;
    default:
      return tGlobal`没有成功，请重试。`;
  }
}

function RelDate({ date, today }: { date: string; today: string }) {
  const r = relativeDate(date, today);
  if (r.kind === "today") return <Trans>今天</Trans>;
  if (r.kind === "ago") {
    const days = r.days;
    return <Trans>{days} 天前</Trans>;
  }
  if (r.kind === "in") {
    const days = r.days;
    return <Trans>{days} 天后</Trans>;
  }
  return <>{r.date.slice(5).replace("-", "/")}</>;
}

const PRESET_KEY = "tasks.preset";
function loadPreset(): PresetId {
  try {
    const v = localStorage.getItem(PRESET_KEY);
    if (v && PRESETS.some((p) => p.id === v)) return v as PresetId;
  } catch {
    /* 隐私模式等读不到本地存储时用默认视图 */
  }
  return "all";
}

/**
 * 多维表格（对照 LYC 的 Notion Tasks）：同一批任务的表格 / 看板视图，私人和 EverHarvest 合在一起，
 * 每行标出空间，可以按空间筛选。纯展示，数据和写操作由 TasksPage 或示例页传入。
 */
export function TasksView({
  tasks,
  people,
  workspaces,
  actions,
  onBack,
  today = todayString(),
}: {
  tasks: Task[] | undefined;
  people: Person[];
  workspaces: Workspace[];
  actions: TasksActions;
  onBack: () => void;
  today?: string;
}) {
  const { t } = useLingui();
  const [presetId, setPresetId] = useState<PresetId>(loadPreset);
  const [space, setSpace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preset = PRESETS.find((p) => p.id === presetId)!;

  useEffect(() => {
    try {
      localStorage.setItem(PRESET_KEY, presetId);
    } catch {
      /* 同上 */
    }
  }, [presetId]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  const run = (fn: () => Promise<unknown>) =>
    void fn().catch((e: unknown) => setError(tasksErrorText(errorCode(e))));

  const wsName = useMemo(() => Object.fromEntries(workspaces.map((w) => [w._id, w.name])), [workspaces]);
  const personById = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  const ctx: Ctx = { people, personById, wsName, tasks: tasks ?? [], today, run, actions, multiSpace: workspaces.length > 1 };

  const rows = useMemo(() => (tasks ? applyPreset(tasks, preset, space) : []), [tasks, preset, space]);

  return (
    <main className="min-h-dvh px-6 py-10 md:px-10">
      <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t`返回`}
          className="grid size-7 place-items-center rounded-sm text-ink-3 transition-colors duration-150 hover:bg-fill hover:text-ink"
        >
          <ChevronLeft size={16} />
        </button>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          <Trans context="page">任务</Trans>
        </h1>
        <nav className="flex flex-wrap gap-1" aria-label={t`视图`}>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === presetId}
              onClick={() => setPresetId(p.id)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-sm transition-colors duration-150",
                p.id === presetId ? "bg-fill text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {presetLabel(p.id)}
            </button>
          ))}
        </nav>
        {workspaces.length > 1 && (
          <div className="ml-auto flex gap-1 text-sm" role="group" aria-label={t`空间`}>
            {[null, ...workspaces.map((w) => w._id)].map((id) => (
              <button
                key={id ?? "all"}
                type="button"
                aria-pressed={space === id}
                onClick={() => setSpace(id)}
                className={cn(
                  "rounded-sm px-2 py-1 transition-colors duration-150",
                  space === id ? "text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {id ? wsName[id] : <Trans>全部空间</Trans>}
              </button>
            ))}
          </div>
        )}
      </header>

      {tasks === undefined ? (
        <p className="text-sm text-ink-3">
          <Trans>正在加载…</Trans>
        </p>
      ) : (
        <>
          <NewTask ctx={ctx} workspaces={workspaces} defaultSpace={space} presetId={presetId} />
          {rows.length === 0 ? (
            <p className="py-10 text-sm text-ink-3">
              <Trans>这个视图里没有任务。</Trans>
            </p>
          ) : preset.kind === "board" ? (
            <Board ctx={ctx} rows={rows} group={preset.group} />
          ) : (
            <Table ctx={ctx} rows={rows} group={preset.group} />
          )}
        </>
      )}

      {error && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-sm text-canvas shadow-pop"
        >
          {error}
        </div>
      )}
    </main>
  );
}

type Ctx = {
  people: Person[];
  personById: Map<string, Person>;
  wsName: Record<string, string>;
  tasks: Task[];
  today: string;
  run: (fn: () => Promise<unknown>) => void;
  actions: TasksActions;
  multiSpace: boolean;
};

function assigneeName(ctx: Ctx, id: string | undefined) {
  if (!id) return null;
  if (id === AI_ASSIGNEE) return "AI";
  const p = ctx.personById.get(id);
  return p ? personName(p.email) : "—";
}

function groupTitle(ctx: Ctx, by: GroupBy, key: string, sample: Task): ReactNode {
  if (by === "assignee") return assigneeName(ctx, key || undefined) ?? <Trans>没有负责人</Trans>;
  if (by === "status") return statusLabel(key as Status);
  if (by === "workspace") return ctx.wsName[key];
  if (by === "priority") return key ? key.toUpperCase() : <Trans>没有优先级</Trans>;
  if (by === "project") return sample.project?.title ?? <Trans>不属于任何项目</Trans>;
  return null;
}

/** 新建一行：标题 + 回车。默认建在当前筛选的空间（或第一个空间）的最上层；AI 待办视图里默认指派给 AI */
function NewTask({
  ctx,
  workspaces,
  defaultSpace,
  presetId,
}: {
  ctx: Ctx;
  workspaces: Workspace[];
  defaultSpace: string | null;
  presetId: PresetId;
}) {
  const { t } = useLingui();
  const [title, setTitle] = useState("");
  const [ws, setWs] = useState<string | null>(null);
  const target = ws ?? defaultSpace ?? workspaces[0]?._id;
  if (!target) return null;
  const submit = () => {
    const value = title.trim();
    if (!value) return;
    setTitle("");
    ctx.run(() =>
      ctx.actions.create(target, value, {
        status: "pending",
        ...(presetId === "ai" ? { assigneeId: AI_ASSIGNEE } : {}),
      }),
    );
  };
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-line pb-2">
      <Plus size={14} className="text-ink-3" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        placeholder={t`新建任务，回车保存`}
        aria-label={t`新建任务`}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-ink-3"
      />
      {ctx.multiSpace && (
        <Picker
          label={ctx.wsName[target]}
          ariaLabel={t`建在哪个空间`}
          options={workspaces.map((w) => ({ value: w._id, label: w.name }))}
          value={target}
          onPick={(v) => setWs(v)}
          align="right"
          className="w-auto shrink-0"
        />
      )}
    </div>
  );
}

// 列宽固定，标题列最宽；放不下时横向滚动（像 Notion）
const COLS = "22rem 7rem 6rem 7rem 3.5rem 5rem 5rem 5rem 3.5rem 3.5rem 10rem 12rem 14rem";

/** 按人分组时：自己排第一，然后是其他成员、AI，没有负责人的放最后 */
function groupOrder(ctx: Ctx, group: GroupBy): string[] | undefined {
  if (group !== "assignee") return undefined;
  const people = [...ctx.people].sort((a, b) => Number(b.isMe) - Number(a.isMe));
  return [...people.map((p) => p.userId), AI_ASSIGNEE];
}

function Table({ ctx, rows, group }: { ctx: Ctx; rows: Task[]; group: GroupBy }) {
  const groups = groupTasks(rows, group, groupOrder(ctx, group));
  const head = "px-2 py-1.5 text-left text-xs font-normal text-ink-3";
  return (
    <div className="-mx-2 overflow-x-auto pb-6">
      <div role="table" className="min-w-max">
        <div role="row" className="grid border-b border-line" style={{ gridTemplateColumns: COLS }}>
          <span role="columnheader" className={head}><Trans>标题</Trans></span>
          <span role="columnheader" className={head}><Trans>状态</Trans></span>
          <span role="columnheader" className={head}><Trans>负责人</Trans></span>
          <span role="columnheader" className={head}><Trans context="column">空间</Trans></span>
          <span role="columnheader" className={head}><Trans>优先级</Trans></span>
          <span role="columnheader" className={head}><Trans>开始</Trans></span>
          <span role="columnheader" className={head}><Trans>截止</Trans></span>
          <span role="columnheader" className={head}><Trans>完成</Trans></span>
          <span role="columnheader" className={cn(head, "text-right")}><Trans>预估</Trans></span>
          <span role="columnheader" className={cn(head, "text-right")}><Trans>实际</Trans></span>
          <span role="columnheader" className={head}><Trans>项目</Trans></span>
          <span role="columnheader" className={head}><Trans>依赖</Trans></span>
          <span role="columnheader" className={head}><Trans>备注</Trans></span>
        </div>
        {groups.map((g) => (
          <div key={g.key} role="rowgroup">
            {group !== "none" && (
              <div className="flex items-baseline gap-2 px-2 pb-1 pt-5 text-sm">
                <span className="font-medium text-ink">{groupTitle(ctx, group, g.key, g.tasks[0])}</span>
                <span className="font-mono text-xs text-ink-3">{g.tasks.length}</span>
              </div>
            )}
            {g.tasks.map((task) => (
              <TaskRow key={task._id} ctx={ctx} task={task} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskRow({ ctx, task }: { ctx: Ctx; task: Task }) {
  const { t } = useLingui();
  const up = (patch: TaskPatch) => ctx.run(() => ctx.actions.update(task._id, patch));
  const cell = "flex min-h-9 items-center px-2 text-sm";
  return (
    <div
      role="row"
      className="group/row grid border-b border-line/70 transition-colors duration-150 hover:bg-fill"
      style={{ gridTemplateColumns: COLS }}
    >
      <div role="cell" className={cn(cell, "gap-2")}>
        <DoneBox status={task.status} onToggle={() => up({ status: task.status === "done" ? "pending" : "done" })} />
        <TextCell
          value={task.title}
          ariaLabel={t`标题`}
          onSave={(title) => up({ title })}
          // 完成只靠勾选框表示，文字不划线（DESIGN.md「完成状态」）
          className={cn("text-ink", task.status === "done" && "text-ink-2", task.status === "cancelled" && "text-ink-3")}
        />
      </div>
      <div role="cell" className={cell}>
        <StatusPicker status={task.status} onPick={(status) => up({ status })} />
      </div>
      <div role="cell" className={cell}>
        <AssigneePicker ctx={ctx} task={task} onPick={(assigneeId) => up({ assigneeId })} />
      </div>
      <div role="cell" className={cn(cell, "text-ink-2")}>
        <span className="truncate">{ctx.wsName[task.workspaceId]}</span>
      </div>
      <div role="cell" className={cell}>
        <Picker
          label={task.priority ? <span className={cn("font-mono text-xs", PRIORITY_TEXT[task.priority])}>{task.priority.toUpperCase()}</span> : null}
          ariaLabel={t`优先级`}
          options={[{ value: null, label: tGlobal`无` }, ...PRIORITIES.map((p) => ({ value: p, label: p.toUpperCase() }))]}
          value={task.priority ?? null}
          onPick={(v) => up({ priority: v as Priority | null })}
        />
      </div>
      <div role="cell" className={cell}>
        <DateCell value={task.startDate} today={ctx.today} ariaLabel={t`开始`} onSave={(startDate) => up({ startDate })} />
      </div>
      <div role="cell" className={cell}>
        <DateCell
          value={task.dueDate}
          today={ctx.today}
          ariaLabel={t`截止`}
          overdue={!!task.dueDate && task.dueDate < ctx.today && task.status !== "done" && task.status !== "cancelled"}
          onSave={(dueDate) => up({ dueDate })}
        />
      </div>
      <div role="cell" className={cn(cell, "text-ink-3")}>
        {task.completedAt && <RelDate date={dateString(task.completedAt)} today={ctx.today} />}
      </div>
      <div role="cell" className={cn(cell, "justify-end")}>
        <NumberCell value={task.estimatedHours} ariaLabel={t`预估工时`} onSave={(estimatedHours) => up({ estimatedHours })} />
      </div>
      <div role="cell" className={cn(cell, "justify-end")}>
        <NumberCell value={task.actualHours} ariaLabel={t`实际工时`} onSave={(actualHours) => up({ actualHours })} />
      </div>
      <div role="cell" className={cn(cell, "text-ink-2")}>
        <span className="truncate">{task.project?.title}</span>
      </div>
      <div role="cell" className={cn(cell, "gap-1 overflow-hidden")}>
        <Deps ctx={ctx} task={task} />
      </div>
      <div role="cell" className={cell}>
        <TextCell
          value={task.notes ?? ""}
          ariaLabel={t`备注`}
          onSave={(notes) => up({ notes: notes || null })}
          className="text-ink-2"
        />
      </div>
    </div>
  );
}

function DoneBox({ status, onToggle }: { status: Status; onToggle: () => void }) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      aria-label={status === "done" ? t`标为未完成` : t`标为完成`}
      aria-pressed={status === "done"}
      onClick={onToggle}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-sm border transition-colors duration-150 active:scale-95",
        status === "done"
          ? "border-success bg-success text-canvas"
          : status === "in_progress"
            ? "border-accent"
            : status === "blocked"
              ? "border-danger"
              : "border-ink-3 hover:border-ink-2",
      )}
    >
      {status === "done" && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

/** 单行文字：本地草稿，回车或失焦保存，Esc 放弃 */
function TextCell({
  value,
  onSave,
  ariaLabel,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn("min-w-0 flex-1 truncate bg-transparent py-1 outline-none", className)}
    />
  );
}

function NumberCell({
  value,
  onSave,
  ariaLabel,
}: {
  value: number | undefined;
  onSave: (v: number | null) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null) {
      const n = draft.trim() === "" ? null : Number(draft);
      if (n === null || (Number.isFinite(n) && n >= 0)) {
        if ((n ?? undefined) !== value) onSave(n);
      }
    }
    setDraft(null);
  };
  return (
    <input
      inputMode="decimal"
      value={draft ?? (value === undefined ? "" : String(value))}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-full bg-transparent py-1 text-right font-mono text-xs text-ink-2 outline-none"
    />
  );
}

/** 日期：平时显示相对日期，点开是系统日期选择器 */
function DateCell({
  value,
  today,
  onSave,
  ariaLabel,
  overdue,
}: {
  value: string | undefined;
  today: string;
  onSave: (v: string | null) => void;
  ariaLabel: string;
  overdue?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        aria-label={ariaLabel}
        onBlur={(e) => {
          setEditing(false);
          const v = e.target.value || null;
          if ((v ?? undefined) !== value) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full bg-transparent text-xs text-ink outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setEditing(true)}
      className={cn(
        "h-7 w-full rounded-sm text-left text-sm transition-colors duration-150",
        overdue ? "text-danger" : "text-ink-2",
        !value && "opacity-0 group-hover/row:opacity-100",
      )}
    >
      {value ? <RelDate date={value} today={today} /> : <span className="text-ink-3">—</span>}
    </button>
  );
}

type Option = { value: string | null; label: ReactNode };

/** 通用的单选下拉（状态、负责人、优先级、空间） */
function Picker({
  label,
  ariaLabel,
  options,
  value,
  onPick,
  align = "left",
  className = "w-full",
}: {
  label: ReactNode;
  ariaLabel: string;
  options: Option[];
  value: string | null;
  onPick: (v: string | null) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-full items-center rounded-sm text-left text-sm text-ink-2 transition-colors duration-150 hover:text-ink"
      >
        {label ?? <span className="text-ink-3 opacity-0 group-hover/row:opacity-100">—</span>}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} align={align}>
          {options.map((o) => (
            <button
              key={o.value ?? "none"}
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => {
                setOpen(false);
                if (o.value !== value) onPick(o.value);
              }}
            >
              {o.label}
              {o.value === value && <Check size={12} />}
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}

const MENU_ITEM =
  "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-line/60 hover:text-ink";

function Popover({ children, onClose, align = "left" }: { children: ReactNode; onClose: () => void; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      className={cn(
        "absolute top-8 z-20 max-h-72 w-52 overflow-y-auto rounded-md bg-raised p-1 shadow-pop",
        align === "right" ? "right-0" : "left-0",
      )}
    >
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
      {statusLabel(status)}
    </span>
  );
}

function StatusPicker({ status, onPick }: { status: Status; onPick: (s: Status) => void }) {
  const { t } = useLingui();
  return (
    <Picker
      label={<StatusChip status={status} />}
      ariaLabel={t`状态`}
      options={STATUS_ORDER.map((s) => ({ value: s, label: <StatusChip status={s} /> }))}
      value={status}
      onPick={(v) => v && onPick(v as Status)}
    />
  );
}

/** 只列出任务所在空间的成员 + AI（私人任务不能指派给不在私人空间的人，服务端也会拦） */
function AssigneePicker({ ctx, task, onPick }: { ctx: Ctx; task: Task; onPick: (v: string | null) => void }) {
  const { t } = useLingui();
  const options: Option[] = [
    { value: null, label: tGlobal`没有负责人` },
    ...ctx.people
      .filter((p) => p.workspaceIds.includes(task.workspaceId))
      .map((p) => ({ value: p.userId, label: personName(p.email) })),
    { value: AI_ASSIGNEE, label: "AI" },
  ];
  return (
    <Picker
      label={assigneeName(ctx, task.assigneeId)}
      ariaLabel={t`负责人`}
      options={options}
      value={task.assigneeId ?? null}
      onPick={onPick}
    />
  );
}

/** 依赖：显示这个任务在等的任务（没完成的用 warning 点标出），可以加和删 */
function Deps({ ctx, task }: { ctx: Ctx; task: Task }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const taken = new Set([task._id, ...task.dependsOn.map((d) => d._id)]);
  const candidates = ctx.tasks
    .filter((x) => !taken.has(x._id) && x.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  return (
    <>
      {task.dependsOn.map((d) => {
        const done = d.status === "done" || d.status === "cancelled";
        return (
          <span key={d._id} className="group/dep inline-flex max-w-40 items-center gap-1 rounded-sm bg-fill px-1.5 py-0.5 text-xs text-ink-2">
            {!done && <span className="size-1.5 shrink-0 rounded-full bg-warning" />}
            <span className="truncate">{d.title}</span>
            <button
              type="button"
              aria-label={t`去掉依赖`}
              onClick={() => d.linkId && ctx.run(() => ctx.actions.removeDependency(d.linkId!))}
              className="hidden text-ink-3 hover:text-ink group-hover/dep:inline"
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      <div className="relative">
        <button
          type="button"
          aria-label={t`加依赖`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-5 place-items-center rounded-sm text-ink-3 opacity-0 transition-opacity duration-150 hover:text-ink group-hover/row:opacity-100"
        >
          <Plus size={12} />
        </button>
        {open && (
          <Popover onClose={() => setOpen(false)}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t`搜索要等的任务`}
              className="mb-1 w-full rounded-sm bg-fill px-2 py-1 text-sm text-ink outline-none placeholder:text-ink-3"
            />
            {candidates.map((c) => (
              <button
                key={c._id}
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  ctx.run(() => ctx.actions.addDependency(task._id, c._id));
                }}
              >
                <span className="truncate">{c.title}</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="px-2 py-1 text-xs text-ink-3">
                <Trans>没有找到</Trans>
              </p>
            )}
          </Popover>
        )}
      </div>
    </>
  );
}

/** 看板：按人分列，每列里按状态分段；拖动卡片换负责人 / 换状态 */
function Board({ ctx, rows, group }: { ctx: Ctx; rows: Task[]; group: GroupBy }) {
  const columns = groupTasks(rows, group, groupOrder(ctx, group));
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drop = (colKey: string, status: Status) => {
    const task = rows.find((r) => r._id === dragId);
    setDragId(null);
    setOver(null);
    if (!task) return;
    const patch: TaskPatch = {};
    if (task.status !== status) patch.status = status;
    if (group === "assignee" && groupKey(task, group) !== colKey) patch.assigneeId = colKey || null;
    if (Object.keys(patch).length) ctx.run(() => ctx.actions.update(task._id, patch));
  };
  const lanes: Status[] = ["in_progress", "blocked", "pending", "backlog"];
  return (
    <div className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-6">
      {columns.map((col) => (
        <section key={col.key} className="w-72 shrink-0">
          <header className="flex items-baseline gap-2 px-1 pb-2 pt-1 text-sm">
            <span className="font-medium text-ink">{groupTitle(ctx, group, col.key, col.tasks[0])}</span>
            <span className="font-mono text-xs text-ink-3">{col.tasks.length}</span>
          </header>
          {lanes.map((status) => {
            const cards = col.tasks.filter((t) => t.status === status);
            const id = `${col.key}:${status}`;
            if (cards.length === 0 && !dragId) return null;
            return (
              <div
                key={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(id);
                }}
                onDragLeave={() => setOver((o) => (o === id ? null : o))}
                onDrop={() => drop(col.key, status)}
                className={cn(
                  "mb-3 rounded-md p-1 transition-colors duration-150",
                  over === id && "bg-fill",
                )}
              >
                <p className="px-1 pb-1">
                  <StatusChip status={status} />
                </p>
                <div className="space-y-1.5">
                  {cards.map((task) => (
                    <Card key={task._id} ctx={ctx} task={task} dragging={dragId === task._id} onDrag={setDragId} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function Card({
  ctx,
  task,
  dragging,
  onDrag,
}: {
  ctx: Ctx;
  task: Task;
  dragging: boolean;
  onDrag: (id: string | null) => void;
}) {
  const est = task.estimatedHours;
  const deps = task.openDeps;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDrag(task._id);
      }}
      onDragEnd={() => onDrag(null)}
      className={cn(
        "cursor-grab rounded-md border border-line bg-canvas px-3 py-2 transition-[opacity,border-color] duration-150 hover:border-ink-3 active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <p className="text-sm leading-5 text-ink">{task.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        {ctx.multiSpace && <span className="rounded-sm bg-fill px-1.5 py-0.5 text-ink-2">{ctx.wsName[task.workspaceId]}</span>}
        {task.priority && <span className={cn("font-mono", PRIORITY_TEXT[task.priority])}>{task.priority.toUpperCase()}</span>}
        {est !== undefined && (
          <span className="font-mono">
            <Trans>{est} 小时</Trans>
          </span>
        )}
        {deps > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warning" />
            <Trans>等 {deps} 项</Trans>
          </span>
        )}
        {task.dueDate && (
          <span className={cn(task.dueDate < ctx.today && "text-danger")}>
            <RelDate date={task.dueDate} today={ctx.today} />
          </span>
        )}
      </div>
    </article>
  );
}
