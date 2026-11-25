import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { assertWorkspace, canAccessWorkspace, redactNode } from "./lib/access";
import { authedQuery } from "./lib/functions";

/**
 * 多维表格（CLAUDE.md「多维表格视图」）的数据：有状态的节点就是任务。
 *
 * 权限规则 7：对 viewer.workspaceIds 里的每个空间分别按 by_workspace_status 索引取数再合并，
 * LYC 拿到私人 + EverHarvest，cxuq 调同一个接口天然只有 EverHarvest。
 * 只返回表格要用的字段；「所属项目」「依赖」只取读者看得到的节点（权限规则 4、5）。
 */
const STATUSES = ["in_progress", "blocked", "pending", "done", "backlog", "cancelled"] as const;

type Ref = { _id: Id<"nodes">; title: string; status?: Doc<"nodes">["status"] };

export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const docs = new Map<Id<"nodes">, Doc<"nodes"> | null>();
    const get = async (id: Id<"nodes">) => {
      if (!docs.has(id)) docs.set(id, await ctx.db.get(id));
      return docs.get(id) ?? null;
    };
    const visible = (n: Doc<"nodes"> | null): n is Doc<"nodes"> =>
      !!n && n.deletedAt === undefined && canAccessWorkspace(ctx.viewer, n.workspaceId);
    const redactCache = new Map<Id<"nodes">, Id<"workspaces"> | null>();

    const rows = [];
    for (const workspaceId of ctx.viewer.workspaceIds) {
      for (const status of STATUSES) {
        const nodes = await ctx.db
          .query("nodes")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId).eq("status", status))
          .collect();
        for (const n of nodes) {
          if (n.deletedAt !== undefined) continue;
          docs.set(n._id, n);
          const r = await redactNode(ctx, ctx.viewer, n, redactCache);

          // 所属项目：最近的 type = project 的可见祖先
          let project: Ref | null = null;
          for (let i = r.ancestorIds.length - 1; i >= 0; i--) {
            const a = await get(r.ancestorIds[i]);
            if (visible(a) && a.type === "project") {
              project = { _id: a._id, title: a.title };
              break;
            }
          }

          const out = await ctx.db
            .query("nodeLinks")
            .withIndex("by_from", (q) => q.eq("fromId", n._id).eq("kind", "depends_on"))
            .collect();
          const dependsOn = [];
          for (const l of out) {
            const to = await get(l.toId);
            if (visible(to)) dependsOn.push({ linkId: l._id, _id: to._id, title: to.title, status: to.status });
          }
          const inc = await ctx.db
            .query("nodeLinks")
            .withIndex("by_to", (q) => q.eq("toId", n._id).eq("kind", "depends_on"))
            .collect();
          const blocking = [];
          for (const l of inc) {
            const from = await get(l.fromId);
            if (visible(from)) blocking.push({ linkId: l._id, _id: from._id, title: from.title, status: from.status });
          }

          rows.push({
            _id: n._id,
            parentId: r.parentId,
            title: n.title,
            type: n.type,
            workspaceId: n.workspaceId,
            status: n.status!,
            assigneeId: n.assigneeId,
            priority: n.priority,
            startDate: n.startDate,
            dueDate: n.dueDate,
            completedAt: n.completedAt,
            estimatedHours: n.estimatedHours,
            actualHours: n.actualHours,
            notes: n.notes,
            createdAt: n.createdAt,
            project,
            dependsOn,
            blocking,
            openDeps: dependsOn.filter((d) => d.status !== "done" && d.status !== "cancelled").length,
          });
        }
      }
    }
    return rows;
  },
});

/** 可以指派的人：读者所在各空间里已加入的成员（按空间分开，私人任务只能指给私人空间的成员）。 */
export const people = authedQuery({
  args: {},
  handler: async (ctx) => {
    const byUser = new Map<string, { userId: string; email: string; workspaceIds: Id<"workspaces">[] }>();
    for (const workspaceId of ctx.viewer.workspaceIds) {
      const ms = await ctx.db
        .query("memberships")
        .withIndex("by_workspace_email", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      for (const m of ms) {
        if (!m.userId) continue;
        const p = byUser.get(m.userId) ?? { userId: m.userId, email: m.email, workspaceIds: [] };
        p.workspaceIds.push(workspaceId);
        byUser.set(m.userId, p);
      }
    }
    return [...byUser.values()].map((p) => ({ ...p, isMe: p.userId === ctx.viewer.userId }));
  },
});

/** 某个空间下可以挂任务的项目（type = project），给「新建任务」和「改所属项目」用。 */
export const projects = authedQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    assertWorkspace(ctx.viewer, workspaceId);
    const all = await ctx.db
      .query("nodes")
      .withIndex("by_workspace_path", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return all
      .filter((n) => n.deletedAt === undefined && n.type === "project")
      .map((n) => ({ _id: n._id, title: n.title }));
  },
});
