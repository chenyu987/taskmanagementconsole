import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { nodePriority, nodeStatus } from "./schema";
import { assertNode, canAccessWorkspace, errors, redactNode, type Viewer } from "./lib/access";
import { authedMutation, authedQuery } from "./lib/functions";
import { sortKeyAt } from "./lib/order";
import { refreshRollups } from "./lib/rollup";
import { applyStatusChange } from "./lib/status";
import { positionUnder, subtreeUpperBound } from "./lib/tree";

function fail(code: string): never {
  throw new ConvexError({ code });
}

const MAX_TITLE = 2000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ───────────────────────────── 读 ─────────────────────────────

/** 读一个节点（祖先链已按读者权限裁剪）。无权或不存在都抛 NOT_FOUND。 */
export const get = authedQuery({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const node = await assertNode(ctx, ctx.viewer, nodeId);
    return await redactNode(ctx, ctx.viewer, node);
  },
});

/** 列出一个节点的直接子节点，按 sortKey 排序；跳过回收站和读者无权看到的子节点。 */
export const listChildren = authedQuery({
  args: { parentId: v.id("nodes") },
  handler: async (ctx, { parentId }) => {
    await assertNode(ctx, ctx.viewer, parentId);
    const children = await ctx.db
      .query("nodes")
      .withIndex("by_parent_sort", (q) => q.eq("parentId", parentId))
      .collect();
    const cache = new Map<Id<"nodes">, Id<"workspaces"> | null>();
    const visible = [];
    for (const child of children) {
      if (child.deletedAt !== undefined) continue;
      if (!canAccessWorkspace(ctx.viewer, child.workspaceId)) continue;
      visible.push(await redactNode(ctx, ctx.viewer, child, cache));
    }
    return visible;
  },
});

/**
 * 大纲：读者能看到的整棵树（扁平列表，前端按 parentId + sortKey 组装）。
 *
 * 顶层 = 读者所在各工作区的根节点里，父节点读者看不到的那些（LYC 是「人生」，cxuq 是「EverHarvest」）。
 * 按权限规则 7：对每个可访问的工作区分别用 by_workspace_path 做子树前缀范围查询，不取全表。
 * 每个节点经过 redactNode，cxuq 拿到的 EverHarvest 根没有 parentId、ancestorIds 里没有私人祖先。
 */
export const outline = authedQuery({
  args: {},
  handler: async (ctx) => {
    const cache = new Map<Id<"nodes">, Id<"workspaces"> | null>();
    const roots: Doc<"nodes">[] = [];
    for (const wsId of ctx.viewer.workspaceIds) {
      const ws = await ctx.db.get(wsId);
      const root = ws?.rootNodeId ? await ctx.db.get(ws.rootNodeId) : null;
      if (!root || root.deletedAt !== undefined) continue;
      const parent = root.parentId ? await ctx.db.get(root.parentId) : null;
      const parentVisible =
        parent && parent.deletedAt === undefined && canAccessWorkspace(ctx.viewer, parent.workspaceId);
      if (!parentVisible) roots.push(root);
    }

    const nodes = [];
    for (const root of roots) {
      for (const wsId of ctx.viewer.workspaceIds) {
        const rows = await ctx.db
          .query("nodes")
          .withIndex("by_workspace_path", (q) =>
            q.eq("workspaceId", wsId).gte("path", root.path).lt("path", subtreeUpperBound(root.path)),
          )
          .collect();
        for (const n of rows) {
          if (n.deletedAt !== undefined) continue;
          nodes.push(await redactNode(ctx, ctx.viewer, n, cache));
        }
      }
    }
    return { rootIds: roots.map((r) => r._id), nodes };
  },
});

// ───────────────────────────── 写 ─────────────────────────────

async function isWorkspaceRoot(ctx: QueryCtx, node: Doc<"nodes">) {
  const ws = await ctx.db.get(node.workspaceId);
  return ws?.rootNodeId === node._id;
}

/** 子树里所有节点（含回收站里的，含挂在下面的其他工作区）。只在服务端内部用于批量改写。 */
async function subtree(ctx: QueryCtx, node: Doc<"nodes">) {
  const result: Doc<"nodes">[] = [];
  for (const ws of await ctx.db.query("workspaces").collect()) {
    const rows = await ctx.db
      .query("nodes")
      .withIndex("by_workspace_path", (q) =>
        q.eq("workspaceId", ws._id).gte("path", node.path).lt("path", subtreeUpperBound(node.path)),
      )
      .collect();
    result.push(...rows);
  }
  return result;
}

/** 负责人只能是 "ai"，或这个节点所在空间里已加入的成员（不能把私人任务指给 cxuq，也不能指给外人）。 */
export async function assertAssignable(ctx: QueryCtx, workspaceId: Id<"workspaces">, assigneeId: string) {
  if (assigneeId === AI_ASSIGNEE) return;
  const m = await ctx.db
    .query("memberships")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", assigneeId))
    .first();
  if (!m) fail("INVALID_ASSIGNEE");
}

export const AI_ASSIGNEE = "ai";

const optionalAfter = v.optional(v.union(v.id("nodes"), v.null()));

/** 新建节点，归属父节点所在的工作区。afterId：省略 = 排最后，null = 排最前，id = 紧跟在这个兄弟后面。 */
export const create = authedMutation({
  args: {
    parentId: v.id("nodes"),
    afterId: optionalAfter,
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    // 表格里新建任务时一并设置
    status: v.optional(nodeStatus),
    assigneeId: v.optional(v.string()),
    priority: v.optional(nodePriority),
  },
  handler: async (ctx, { parentId, afterId, title = "", type = "bullet", status, assigneeId, priority }) => {
    const parent = await assertNode(ctx, ctx.viewer, parentId);
    if (title.length > MAX_TITLE) fail("TOO_LONG");
    if (assigneeId) await assertAssignable(ctx, parent.workspaceId, assigneeId);
    const now = Date.now();
    const id = await ctx.db.insert("nodes", {
      title,
      type,
      parentId,
      ancestorIds: [],
      path: "",
      depth: 0,
      sortKey: await sortKeyAt(ctx, parentId, afterId),
      workspaceId: parent.workspaceId,
      assigneeId,
      priority,
      ...(status ? applyStatusChange({ status: undefined, startedAt: undefined, completedAt: undefined }, status, now) : {}),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(id, positionUnder(parent, id));
    if (status) await refreshRollups(ctx, parentId);
    return id;
  },
});

const clearable = <T extends Parameters<typeof v.union>[0]>(x: T) => v.optional(v.union(x, v.null()));

/** 改节点字段。null 表示清空。改状态时 startedAt / completedAt 由 lib/status.ts 维护，并更新进度汇总。 */
export const update = authedMutation({
  args: {
    nodeId: v.id("nodes"),
    title: v.optional(v.string()),
    type: v.optional(v.string()),
    status: clearable(nodeStatus),
    priority: clearable(nodePriority),
    startDate: clearable(v.string()),
    dueDate: clearable(v.string()),
    estimatedHours: clearable(v.number()),
    actualHours: clearable(v.number()),
    collapsed: v.optional(v.boolean()),
    assigneeId: clearable(v.string()),
    notes: clearable(v.string()),
  },
  handler: async (ctx, { nodeId, status, ...fields }) => {
    const node = await assertNode(ctx, ctx.viewer, nodeId);
    if (fields.title !== undefined && fields.title.length > MAX_TITLE) fail("TOO_LONG");
    if (fields.notes && fields.notes.length > MAX_TITLE) fail("TOO_LONG");
    if (fields.assigneeId) await assertAssignable(ctx, node.workspaceId, fields.assigneeId);
    for (const d of [fields.startDate, fields.dueDate]) if (d && !DATE.test(d)) fail("INVALID_DATE");
    for (const h of [fields.estimatedHours, fields.actualHours]) if (h != null && (h < 0 || !isFinite(h))) fail("INVALID_HOURS");

    const patch: Partial<Doc<"nodes">> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) (patch as Record<string, unknown>)[k] = val ?? undefined;
    }
    if (status !== undefined && (status ?? undefined) !== node.status) {
      Object.assign(patch, applyStatusChange(node, status ?? undefined, patch.updatedAt!));
    }
    await ctx.db.patch(nodeId, patch);
    if ("status" in patch) await refreshRollups(ctx, node.parentId);
  },
});

/**
 * 移动节点（缩进、反缩进、上下移、拖动都用它），整棵子树的 ancestorIds / path / depth 一起改写。
 * - 工作区根节点不能移动（ROOT_LOCKED），挂载关系以后单独做
 * - 只能在同一个工作区里移动（CROSS_WORKSPACE），避免私人节点挂进 EverHarvest 被别人看到
 * - 不能移到自己的子孙下面（INVALID_MOVE）
 */
export const move = authedMutation({
  args: { nodeId: v.id("nodes"), parentId: v.id("nodes"), afterId: optionalAfter },
  handler: async (ctx, { nodeId, parentId, afterId }) => {
    const node = await assertNode(ctx, ctx.viewer, nodeId);
    const parent = await assertNode(ctx, ctx.viewer, parentId);
    if (await isWorkspaceRoot(ctx, node)) fail("ROOT_LOCKED");
    if (parent.workspaceId !== node.workspaceId) fail("CROSS_WORKSPACE");
    if (parent._id === node._id || parent.ancestorIds.includes(node._id)) fail("INVALID_MOVE");

    const oldParentId = node.parentId;
    const sortKey = await sortKeyAt(ctx, parentId, afterId, nodeId);
    const pos = positionUnder(parent, nodeId);
    if (oldParentId !== parentId) {
      const keep = node.ancestorIds.length;
      for (const d of await subtree(ctx, node)) {
        if (d._id === nodeId) continue;
        await ctx.db.patch(d._id, {
          ancestorIds: [...pos.ancestorIds, nodeId, ...d.ancestorIds.slice(keep + 1)],
          path: pos.path + d.path.slice(node.path.length),
          depth: d.depth - node.depth + pos.depth,
        });
      }
    }
    await ctx.db.patch(nodeId, { ...pos, parentId, sortKey, updatedAt: Date.now() });
    if (oldParentId !== parentId) {
      await refreshRollups(ctx, oldParentId);
      await refreshRollups(ctx, parentId);
    }
  },
});

/** 删除 = 整棵子树进回收站（软删除）。工作区根节点、以及下面挂着别的工作区的子树不能删。 */
export const remove = authedMutation({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const node = await assertNode(ctx, ctx.viewer, nodeId);
    if (await isWorkspaceRoot(ctx, node)) fail("ROOT_LOCKED");
    const all = await subtree(ctx, node);
    if (all.some((d) => d.workspaceId !== node.workspaceId)) fail("CONTAINS_WORKSPACE");
    const deletedAt = Date.now();
    for (const d of all) if (d.deletedAt === undefined) await ctx.db.patch(d._id, { deletedAt });
    await refreshRollups(ctx, node.parentId);
    return { deletedAt };
  },
});

async function assertDeletedNode(ctx: MutationCtx, viewer: Viewer, nodeId: Id<"nodes">) {
  const node = await ctx.db.get(nodeId);
  // 和 assertNode 一样：不存在、无权、没在回收站，一律 NOT_FOUND
  if (!node || node.deletedAt === undefined || !canAccessWorkspace(viewer, node.workspaceId)) {
    throw errors.notFound();
  }
  return node;
}

/** 从回收站恢复（撤销删除）：恢复这一次一起删掉的整棵子树。父节点也在回收站里时先恢复父节点。 */
export const restore = authedMutation({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const node = await assertDeletedNode(ctx, ctx.viewer, nodeId);
    const parent = node.parentId ? await ctx.db.get(node.parentId) : null;
    if (!parent || parent.deletedAt !== undefined) fail("PARENT_DELETED");
    for (const d of await subtree(ctx, node)) {
      if (d.deletedAt === node.deletedAt) await ctx.db.patch(d._id, { deletedAt: undefined });
    }
    await refreshRollups(ctx, node.parentId);
  },
});
