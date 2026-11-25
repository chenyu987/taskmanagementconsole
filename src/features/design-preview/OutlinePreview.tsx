import { generateKeyBetween } from "fractional-indexing";
import { useMemo, useState } from "react";
import { OutlineView, type OutlineActions } from "@/features/outline/OutlineView";
import type { OutlineNode, Status } from "@/features/outline/tree";

/**
 * 设计确认 / 截图用：大纲的样例数据，写操作在内存里完成（可以真的打字、缩进、折叠）。
 * 打开方式：本地 /?preview=outline
 */
type Seed = [id: string, parent: string | null, title: string, type: string, ws: string, status?: Status, collapsed?: boolean];

const SEED: Seed[] = [
  ["life", null, "人生", "vision", "p"],
  ["health", "life", "健康", "area", "p"],
  ["run", "health", "每周跑步 3 次", "task", "p", "in_progress"],
  ["checkup", "health", "预约年度体检", "task", "p", "done"],
  ["learn", "life", "学习", "area", "p"],
  ["books", "learn", "读书清单", "bullet", "p", undefined, true],
  ["b1", "books", "《穷查理宝典》", "bullet", "p"],
  ["eh", "life", "EverHarvest", "area", "e"],
  ["season", "eh", "2026–27 雪季上架", "project", "e"],
  ["epic", "season", "确认 Epic Pass 团购报价", "task", "e", "blocked"],
  ["ikon", "season", "更新 Ikon Pass 价格表", "task", "e", "in_progress"],
  ["listing", "season", "上架页面文案", "task", "e", "done"],
  ["listing-1", "listing", "中英文两版，突出团购价", "bullet", "e"],
  ["refund", "season", "退款政策写清楚", "task", "e", "pending"],
  ["cs", "eh", "客服", "area", "e", undefined, true],
  ["cs-1", "cs", "回复退款邮件", "task", "e", "done"],
  ["idea", "life", "想法：做一个雪场天气提醒", "bullet", "p"],
];

function seedNodes(): OutlineNode[] {
  const last = new Map<string, string | null>();
  return SEED.map(([id, parent, title, type, ws, status, collapsed]) => {
    const key = generateKeyBetween(last.get(parent ?? "") ?? null, null);
    last.set(parent ?? "", key);
    return { _id: id, parentId: parent ?? undefined, title, type, workspaceId: ws, sortKey: key, status, collapsed };
  });
}

/** 和服务端 lib/rollup.ts 同样的规则，在内存里现算 */
function withRollups(nodes: OutlineNode[]): OutlineNode[] {
  const kids = new Map<string, OutlineNode[]>();
  for (const n of nodes) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const memo = new Map<string, { done: number; total: number }>();
  const calc = (id: string): { done: number; total: number } => {
    if (memo.has(id)) return memo.get(id)!;
    let done = 0;
    let total = 0;
    for (const c of kids.get(id) ?? []) {
      const self = c.status !== undefined && c.status !== "cancelled";
      const r = calc(c._id);
      done += (self && c.status === "done" ? 1 : 0) + r.done;
      total += (self ? 1 : 0) + r.total;
    }
    const res = { done, total };
    memo.set(id, res);
    return res;
  };
  return nodes.map((n) => {
    const r = calc(n._id);
    return { ...n, rollup: r.total > 0 ? r : undefined };
  });
}

let counter = 0;

export default function OutlinePreview() {
  const [nodes, setNodes] = useState<(OutlineNode & { deleted?: boolean })[]>(seedNodes);
  const [zoomId, setZoomId] = useState<string | null>(null);

  const live = useMemo(() => withRollups(nodes.filter((n) => !n.deleted)), [nodes]);

  const keyAfter = (all: OutlineNode[], parentId: string, afterId: string | null | undefined, exclude?: string) => {
    const sibs = all
      .filter((n) => n.parentId === parentId && n._id !== exclude && !(n as { deleted?: boolean }).deleted)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
    if (afterId === undefined) return generateKeyBetween(sibs.at(-1)?.sortKey ?? null, null);
    if (afterId === null) return generateKeyBetween(null, sibs[0]?.sortKey ?? null);
    const i = sibs.findIndex((n) => n._id === afterId);
    return generateKeyBetween(sibs[i].sortKey, sibs[i + 1]?.sortKey ?? null);
  };
  const descendants = (all: OutlineNode[], id: string): Set<string> => {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of all) {
        if (n.parentId && out.has(n.parentId) && !out.has(n._id)) {
          out.add(n._id);
          grew = true;
        }
      }
    }
    return out;
  };

  const actions: OutlineActions = {
    async create(parentId, afterId, title) {
      const id = `new-${++counter}`;
      setNodes((all) => {
        const parent = all.find((n) => n._id === parentId)!;
        return [...all, { _id: id, parentId, title, type: "bullet", workspaceId: parent.workspaceId, sortKey: keyAfter(all, parentId, afterId) }];
      });
      return id;
    },
    async update(id, patch) {
      setNodes((all) =>
        all.map((n) =>
          n._id === id
            ? {
                ...n,
                ...(patch.title !== undefined && { title: patch.title }),
                ...(patch.type !== undefined && { type: patch.type }),
                ...(patch.collapsed !== undefined && { collapsed: patch.collapsed }),
                ...(patch.status !== undefined && { status: patch.status ?? undefined }),
              }
            : n,
        ),
      );
    },
    async move(id, parentId, afterId) {
      const node = nodes.find((n) => n._id === id)!;
      const parent = nodes.find((n) => n._id === parentId)!;
      if (parent.workspaceId !== node.workspaceId) throw { code: "CROSS_WORKSPACE" };
      setNodes((all) => all.map((n) => (n._id === id ? { ...n, parentId, sortKey: keyAfter(all, parentId, afterId, id) } : n)));
    },
    async remove(id) {
      setNodes((all) => {
        const ids = descendants(all, id);
        return all.map((n) => (ids.has(n._id) ? { ...n, deleted: true } : n));
      });
    },
    async restore(id) {
      setNodes((all) => {
        const ids = descendants(all, id);
        return all.map((n) => (ids.has(n._id) ? { ...n, deleted: false } : n));
      });
    },
  };

  return (
    <OutlineView
      rootIds={["life"]}
      nodes={live}
      workspaces={{ p: "私人", e: "EverHarvest" }}
      zoomId={zoomId}
      onZoom={setZoomId}
      actions={actions}
      onBack={() => {}}
    />
  );
}
