import { t as tGlobal } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronRight, Ellipsis } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { errorCode } from "@/lib/errorCode";
import { cn } from "@/lib/utils";
import {
  DISPLAY_TYPES,
  VIRTUAL_ROOT,
  ancestorsOf,
  buildTree,
  parentKey,
  siblingsOf,
  visibleRows,
  type OutlineNode,
  type Row,
  type Status,
  type Tree,
} from "./tree";

export type OutlinePatch = {
  title?: string;
  type?: string;
  status?: Status | null;
  collapsed?: boolean;
};

/** 大纲的全部写操作。真数据页接 Convex，示例页接内存实现。失败时抛带 code 的错误。 */
export type OutlineActions = {
  create: (parentId: string, afterId: string | null | undefined, title: string) => Promise<string>;
  update: (id: string, patch: OutlinePatch) => Promise<void>;
  move: (id: string, parentId: string, afterId?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
};

export function outlineErrorText(code: string | undefined) {
  switch (code) {
    case "CROSS_WORKSPACE":
      return tGlobal`不能移到另一个空间里，那样会让原来看不到它的人看到。`;
    case "ROOT_LOCKED":
      return tGlobal`空间的最上层不能移动或删除。`;
    case "CONTAINS_WORKSPACE":
      return tGlobal`下面挂着别的空间，不能整个删除。`;
    case "INVALID_MOVE":
      return tGlobal`不能移到它自己下面。`;
    case "PARENT_DELETED":
      return tGlobal`上一级已经删除了，先恢复上一级。`;
    case "TOO_LONG":
      return tGlobal`标题太长了。`;
    default:
      return tGlobal`没有成功，请重试。`;
  }
}

function typeLabels(): [string, string][] {
  return [
    ["bullet", tGlobal`要点`],
    ["task", tGlobal`任务`],
    ["project", tGlobal`项目`],
    ["area", tGlobal`领域`],
    ["vision", tGlobal`愿景`],
    ["note", tGlobal`笔记`],
  ];
}

function statusLabels(): [Status | null, string][] {
  return [
    [null, tGlobal`无状态`],
    ["backlog", tGlobal`以后再说`],
    ["pending", tGlobal`待开始`],
    ["in_progress", tGlobal`进行中`],
    ["blocked", tGlobal`卡住了`],
    ["done", tGlobal`完成`],
    ["cancelled", tGlobal`取消`],
  ];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";
const SHIFT = isMac ? "⇧" : "Shift+";

type Caret = "start" | "end" | number;
type Focus = { id: string; caret: Caret };

/**
 * 大纲（像 Workflowy）：每一行都是一个真正的节点，层级不限。
 * 纯展示 + 键盘逻辑，数据和写操作由 OutlinePage（真数据）或示例页传入。
 */
export function OutlineView({
  rootIds,
  nodes,
  workspaces,
  zoomId,
  onZoom,
  actions,
  onBack,
}: {
  rootIds: string[];
  nodes: OutlineNode[] | undefined;
  /** 工作区 id → 名字，用来给挂进来的空间打标签 */
  workspaces: Record<string, string>;
  zoomId: string | null;
  onZoom: (id: string | null) => void;
  actions: OutlineActions;
  onBack?: () => void;
}) {
  const { t } = useLingui();
  const tree = useMemo(() => buildTree(nodes ?? [], rootIds), [nodes, rootIds]);
  const topId = rootIds.length === 1 ? rootIds[0] : VIRTUAL_ROOT;
  const rootId = zoomId && tree.byId.has(zoomId) ? zoomId : topId;
  const root = tree.byId.get(rootId);
  const rows = useMemo(() => visibleRows(tree, rootId), [tree, rootId]);
  const crumbs = useMemo(() => (rootId === topId ? [] : ancestorsOf(tree, rootId)), [tree, rootId, topId]);

  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(outlineErrorText(errorCode(e)));
      return undefined;
    }
  };

  const ops: RowOps = {
    async split(row, before, after) {
      const n = row.node;
      if (before === "" && after !== "") {
        // 光标在行首：在上面插一行空的，光标留在原行
        const pid = parentKey(tree, n);
        if (pid === VIRTUAL_ROOT) return;
        const sibs = siblingsOf(tree, n);
        const i = sibs.indexOf(n);
        await run(() => actions.create(pid, i > 0 ? sibs[i - 1]._id : null, ""));
        setFocus({ id: n._id, caret: "start" });
        return;
      }
      // 原行留下光标前的文字（由行组件 commit 保存），光标后的文字带到新行
      const pid = parentKey(tree, n);
      const asChild = (row.hasChildren && !n.collapsed) || pid === VIRTUAL_ROOT;
      const id = await run(() =>
        asChild ? actions.create(n._id, null, after) : actions.create(pid, n._id, after),
      );
      if (id) setFocus({ id, caret: "start" });
    },
    async indent(row, caret) {
      const n = row.node;
      const sibs = siblingsOf(tree, n);
      const i = sibs.indexOf(n);
      if (i <= 0 || parentKey(tree, n) === VIRTUAL_ROOT) return;
      const prev = sibs[i - 1];
      if (prev.collapsed) await run(() => actions.update(prev._id, { collapsed: false }));
      await run(() => actions.move(n._id, prev._id));
      setFocus({ id: n._id, caret });
    },
    async outdent(row, caret) {
      const n = row.node;
      const pid = parentKey(tree, n);
      if (pid === VIRTUAL_ROOT || pid === rootId) return;
      const parent = tree.byId.get(pid)!;
      const gp = parentKey(tree, parent);
      if (gp === VIRTUAL_ROOT) return;
      await run(() => actions.move(n._id, gp, parent._id));
      setFocus({ id: n._id, caret });
    },
    async shift(row, dir, caret) {
      const n = row.node;
      const pid = parentKey(tree, n);
      if (pid === VIRTUAL_ROOT) return;
      const sibs = siblingsOf(tree, n);
      const i = sibs.indexOf(n);
      if (dir < 0 && i > 0) await run(() => actions.move(n._id, pid, i >= 2 ? sibs[i - 2]._id : null));
      else if (dir > 0 && i < sibs.length - 1) await run(() => actions.move(n._id, pid, sibs[i + 1]._id));
      else return;
      setFocus({ id: n._id, caret });
    },
    async remove(row, focusPrev) {
      const n = row.node;
      const idx = rows.findIndex((r) => r.node._id === n._id);
      const target = rows[idx - 1] ?? rows[idx + 1];
      const ok = await run(async () => {
        await actions.remove(n._id);
        return true;
      });
      if (!ok) return;
      setUndo({ id: n._id, title: n.title });
      if (target && focusPrev) setFocus({ id: target.node._id, caret: "end" });
    },
    arrow(row, dir, caret) {
      const idx = rows.findIndex((r) => r.node._id === row.node._id);
      const target = rows[idx + dir];
      if (target) setFocus({ id: target.node._id, caret });
    },
    toggleDone(row) {
      void run(() => actions.update(row.node._id, { status: row.node.status === "done" ? "pending" : "done" }));
    },
    setCollapsed(row, collapsed) {
      if (row.hasChildren && !!row.node.collapsed !== collapsed) {
        void run(() => actions.update(row.node._id, { collapsed }));
      }
    },
    update(row, patch) {
      void run(() => actions.update(row.node._id, patch));
    },
    zoomIn(row) {
      onZoom(row.node._id);
      setFocus(null);
    },
    zoomOut() {
      if (rootId === topId) return;
      const p = tree.byId.get(rootId)?.parentId;
      onZoom(p && tree.byId.has(p) && p !== topId ? p : null);
    },
  };

  const deletedTitle = undo?.title || t`无标题`;

  const addFirst = async () => {
    if (rootId === VIRTUAL_ROOT) return;
    const id = await run(() => actions.create(rootId, undefined, ""));
    if (id) setFocus({ id, caret: "start" });
  };

  return (
    <main className="mx-auto max-w-3xl px-6 pb-32 pt-16">
      <header className="flex items-baseline justify-between gap-6">
        <nav className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm text-ink-3" aria-label={t`位置`}>
          {rootId !== topId && (
            <>
              <button type="button" onClick={() => onZoom(null)} className="transition-colors duration-150 hover:text-ink">
                {tree.byId.get(topId)?.title || <Trans>大纲</Trans>}
              </button>
              {crumbs
                .filter((c) => c._id !== topId)
                .map((c) => (
                  <span key={c._id} className="flex items-baseline gap-x-1.5">
                    <span aria-hidden>/</span>
                    <button
                      type="button"
                      onClick={() => onZoom(c._id)}
                      className="max-w-48 truncate transition-colors duration-150 hover:text-ink"
                    >
                      {c.title || t`无标题`}
                    </button>
                  </span>
                ))}
            </>
          )}
        </nav>
        <div className="flex shrink-0 gap-5 text-sm text-ink-3">
          <button
            type="button"
            onClick={() => setShowKeys((v) => !v)}
            aria-expanded={showKeys}
            className="transition-colors duration-150 hover:text-ink"
          >
            <Trans>快捷键</Trans>
          </button>
          {onBack && (
            <button type="button" onClick={onBack} className="transition-colors duration-150 hover:text-ink">
              <Trans>返回今天</Trans>
            </button>
          )}
        </div>
      </header>

      {root ? (
        <TitleInput
          value={root.title}
          ariaLabel={t`标题`}
          placeholder={t`无标题`}
          onSave={(title) => void run(() => actions.update(root._id, { title }))}
          className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight text-ink"
        />
      ) : (
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
          <Trans>大纲</Trans>
        </h1>
      )}

      {showKeys && <KeyHelp />}

      <section className="mt-6" aria-label={t`大纲`}>
        {nodes === undefined ? (
          <p className="text-sm text-ink-3">
            <Trans>正在加载…</Trans>
          </p>
        ) : rows.length === 0 ? (
          <button
            type="button"
            onClick={() => void addFirst()}
            className="text-[15px] text-ink-3 transition-colors duration-150 hover:text-ink-2"
          >
            <Trans>这里还是空的。点这里开始写。</Trans>
          </button>
        ) : (
          <ul role="tree">
            {rows.map((row) => (
              <OutlineRow
                key={row.node._id}
                row={row}
                tree={tree}
                workspaces={workspaces}
                ops={ops}
                focusCaret={focus?.id === row.node._id ? focus.caret : undefined}
                onFocused={() => setFocus(null)}
                onTitle={(title) => void run(() => actions.update(row.node._id, { title }))}
              />
            ))}
          </ul>
        )}
      </section>

      {(error || undo) && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-md bg-ink px-4 py-2.5 text-sm text-canvas shadow-pop"
        >
          {error ?? (
            <>
              <span className="max-w-72 truncate">
                <Trans>已删除「{deletedTitle}」</Trans>
              </span>
              <button
                type="button"
                onClick={() => {
                  const id = undo!.id;
                  setUndo(null);
                  void run(async () => {
                    await actions.restore(id);
                    setFocus({ id, caret: "end" });
                  });
                }}
                className="font-medium transition-opacity duration-150 hover:opacity-80"
              >
                <Trans>撤销</Trans>
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}

type RowOps = {
  split: (row: Row, before: string, after: string) => Promise<void>;
  indent: (row: Row, caret: Caret) => Promise<void>;
  outdent: (row: Row, caret: Caret) => Promise<void>;
  shift: (row: Row, dir: -1 | 1, caret: Caret) => Promise<void>;
  remove: (row: Row, focusPrev: boolean) => Promise<void>;
  arrow: (row: Row, dir: -1 | 1, caret: Caret) => void;
  toggleDone: (row: Row) => void;
  setCollapsed: (row: Row, collapsed: boolean) => void;
  update: (row: Row, patch: OutlinePatch) => void;
  zoomIn: (row: Row) => void;
  zoomOut: () => void;
};

function OutlineRow({
  row,
  tree,
  workspaces,
  ops,
  focusCaret,
  onFocused,
  onTitle,
}: {
  row: Row;
  tree: Tree;
  workspaces: Record<string, string>;
  ops: RowOps;
  focusCaret: Caret | undefined;
  onFocused: () => void;
  onTitle: (title: string) => void;
}) {
  const { t } = useLingui();
  const { node, depth, hasChildren } = row;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const parent = node.parentId ? tree.byId.get(node.parentId) : undefined;
  // 挂进来的另一个空间（例如「人生」下面的 EverHarvest），标出空间名
  const mountedSpace =
    parent && parent.workspaceId !== node.workspaceId && workspaces[node.workspaceId] !== node.title
      ? workspaces[node.workspaceId]
      : undefined;
  const done = node.status === "done" || node.status === "cancelled";

  useLayoutEffect(() => {
    if (focusCaret === undefined) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    const pos = focusCaret === "end" ? len : focusCaret === "start" ? 0 : Math.min(focusCaret, len);
    el.setSelectionRange(pos, pos);
    onFocused();
  }, [focusCaret, onFocused]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, commit: (v: string) => void) => {
    // 中文输入法选字时的回车 / 方向键交给输入法
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    const caret = el.selectionStart;
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === "Enter" && mod) {
      e.preventDefault();
      ops.toggleDone(row);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const before = el.value.slice(0, caret);
      const after = el.value.slice(el.selectionEnd);
      if (before !== "" || after === "") commit(before);
      void ops.split(row, before, after);
    } else if (e.key === "Tab") {
      e.preventDefault();
      void (e.shiftKey ? ops.outdent(row, caret) : ops.indent(row, caret));
    } else if (e.key === "Backspace" && mod && e.shiftKey) {
      e.preventDefault();
      void ops.remove(row, true);
    } else if (e.key === "Backspace" && el.value === "" && !hasChildren) {
      e.preventDefault();
      void ops.remove(row, true);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.shiftKey && (e.altKey || mod)) {
      e.preventDefault();
      void ops.shift(row, e.key === "ArrowUp" ? -1 : 1, caret);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && mod) {
      e.preventDefault();
      ops.setCollapsed(row, e.key === "ArrowUp");
    } else if (e.key === "ArrowUp" && !e.shiftKey) {
      e.preventDefault();
      ops.arrow(row, -1, caret);
    } else if (e.key === "ArrowDown" && !e.shiftKey) {
      e.preventDefault();
      ops.arrow(row, 1, caret);
    } else if (e.key === "." && mod) {
      e.preventDefault();
      ops.zoomIn(row);
    } else if (e.key === "," && mod) {
      e.preventDefault();
      ops.zoomOut();
    }
  };

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? !node.collapsed : undefined}
      className="group/row relative flex items-start rounded-sm transition-colors duration-150 hover:bg-fill focus-within:bg-fill"
      style={{ paddingLeft: `calc(var(--spacing) * ${depth * 6})` }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={node.collapsed ? t`展开` : t`折叠`}
        onClick={() => ops.setCollapsed(row, !node.collapsed)}
        className={cn(
          "grid h-7 w-5 shrink-0 place-items-center text-ink-3 opacity-0 transition-[opacity,color] duration-150 hover:text-ink",
          hasChildren && "group-hover/row:opacity-100",
        )}
      >
        <ChevronRight
          size={14}
          className={cn("transition-transform duration-200 ease-out", hasChildren && !node.collapsed && "rotate-90")}
        />
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t`放大到这一项`}
        title={t`放大到这一项`}
        onClick={() => ops.zoomIn(row)}
        className="grid h-7 w-5 shrink-0 place-items-center"
      >
        <span
          className={cn(
            "rounded-full transition-[transform,background-color] duration-150 group-hover/row:scale-125",
            hasChildren && node.collapsed ? "size-2 bg-ink-2 ring-4 ring-line" : "size-1.5 bg-ink-3",
          )}
        />
      </button>
      {node.status && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={done ? t`标为未完成` : t`标为完成`}
          aria-pressed={node.status === "done"}
          onClick={() => ops.toggleDone(row)}
          className={cn(
            "mr-2 mt-1.5 grid size-4 shrink-0 place-items-center rounded-sm border transition-colors duration-150 active:scale-95",
            node.status === "done"
              ? "border-success bg-success text-canvas"
              : node.status === "in_progress"
                ? "border-accent"
                : node.status === "blocked"
                  ? "border-danger"
                  : "border-ink-3 hover:border-ink-2",
          )}
        >
          {node.status === "done" && <Check size={12} strokeWidth={3} />}
        </button>
      )}
      <TitleInput
        value={node.title}
        inputRef={inputRef}
        ariaLabel={t`标题`}
        onSave={onTitle}
        onKeyDown={onKeyDown}
        className={cn(
          "min-w-0 flex-1 py-0.5 text-[15px] leading-6 text-ink",
          DISPLAY_TYPES.has(node.type) && "font-display font-medium",
          done && "text-ink-3 line-through decoration-ink-3",
        )}
      />
      <div className="flex h-7 shrink-0 items-center gap-3 pl-3 pr-1 text-xs text-ink-3">
        {mountedSpace && <span className="rounded-sm bg-fill px-1.5 py-0.5 text-ink-2">{mountedSpace}</span>}
        {node.rollup && (
          <span className="font-mono tabular-nums">
            {node.rollup.done}/{node.rollup.total}
          </span>
        )}
        <div className="relative">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t`更多`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "grid size-6 place-items-center rounded-sm opacity-0 transition-[opacity,color] duration-150 hover:text-ink group-hover/row:opacity-100",
              menuOpen && "opacity-100",
            )}
          >
            <Ellipsis size={14} />
          </button>
          {menuOpen && (
            <RowMenu
              node={node}
              onClose={() => setMenuOpen(false)}
              onPick={(patch) => {
                setMenuOpen(false);
                ops.update(row, patch);
              }}
              onDelete={() => {
                setMenuOpen(false);
                void ops.remove(row, false);
              }}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/** 行尾「…」菜单：改类型（要点可以直接升级成任务）、改状态、删除 */
function RowMenu({
  node,
  onClose,
  onPick,
  onDelete,
}: {
  node: OutlineNode;
  onClose: () => void;
  onPick: (patch: OutlinePatch) => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-line/60 hover:text-ink";
  return (
    <div ref={ref} role="menu" className="absolute right-0 top-7 z-20 w-44 rounded-md bg-raised p-1 shadow-pop">
      <p className="px-2 pb-1 pt-1.5 text-xs text-ink-3">
        <Trans>类型</Trans>
      </p>
      {typeLabels().map(([value, label]) => (
        <button key={value} type="button" role="menuitem" className={item} onClick={() => onPick({ type: value })}>
          {label}
          {node.type === value && <Check size={12} />}
        </button>
      ))}
      <p className="px-2 pb-1 pt-2.5 text-xs text-ink-3">
        <Trans>状态</Trans>
      </p>
      {statusLabels().map(([value, label]) => (
        <button
          key={value ?? "none"}
          type="button"
          role="menuitem"
          className={item}
          onClick={() => onPick({ status: value })}
        >
          {label}
          {(node.status ?? null) === value && <Check size={12} />}
        </button>
      ))}
      <div className="my-1 h-px bg-line" />
      <button type="button" role="menuitem" className={cn(item, "hover:text-danger")} onClick={onDelete}>
        <Trans>删除</Trans>
        <span className="text-xs text-ink-3">
          {SHIFT}
          {MOD}⌫
        </span>
      </button>
    </div>
  );
}

/**
 * 标题输入框：本地草稿 + 停顿 400ms 自动保存，失焦时立刻保存。
 * 正在编辑时不被服务端的新值覆盖；不在编辑时跟随服务端（别人改了也能看到）。
 */
function TitleInput({
  value,
  onSave,
  onKeyDown,
  inputRef,
  className,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>, commit: (v: string) => void) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (value !== seen && !focused) {
    setSeen(value);
    setDraft(value);
  }
  const timer = useRef<number | undefined>(undefined);
  const own = useRef<HTMLTextAreaElement>(null);
  const local = inputRef ?? own;

  // 自动长高：标题换行时整行一起变高
  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, local]);

  const flush = (v: string) => {
    window.clearTimeout(timer.current);
    if (v !== value) onSave(v);
  };

  return (
    <textarea
      ref={local}
      rows={1}
      spellCheck={false}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, " ");
        setDraft(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onSave(v), 400);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        flush(draft);
      }}
      onKeyDown={(e) =>
        onKeyDown?.(e, (v) => {
          setDraft(v);
          flush(v);
        })
      }
      className={cn(
        "block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-ink-3",
        className,
      )}
    />
  );
}

function KeyHelp() {
  const keys: [string, string][] = [
    ["Enter", tGlobal`新建一行（光标后的文字带到新行）`],
    [`Tab / ${SHIFT}Tab`, tGlobal`缩进 / 反缩进`],
    ["↑ / ↓", tGlobal`上一行 / 下一行`],
    [`${SHIFT}${MOD}↑ / ${SHIFT}${MOD}↓`, tGlobal`上移 / 下移`],
    [`${MOD}↑ / ${MOD}↓`, tGlobal`折叠 / 展开`],
    [`${MOD}Enter`, tGlobal`标为完成 / 未完成`],
    [`${MOD}. / ${MOD},`, tGlobal`放大到这一项 / 回到上一层`],
    [tGlobal`空行按 ⌫`, tGlobal`删除这一行`],
    [`${SHIFT}${MOD}⌫`, tGlobal`连同下面的内容一起删除`],
  ];
  return (
    <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 rounded-md bg-fill px-4 py-3 text-sm">
      {keys.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-xs leading-5 text-ink-2">{k}</dt>
          <dd className="text-ink-3">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
