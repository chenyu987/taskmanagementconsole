import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * 数据模型：一切都是节点（nodes），层级不设上限。
 * 权限按工作区（workspaces）+ 成员（memberships）沿树继承，见 convex/lib/access.ts。
 * Better Auth 的 user / session / account 表由其 Convex 组件管理，不在这里。
 */

export const nodeStatus = v.union(
  v.literal("backlog"),
  v.literal("pending"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("cancelled"),
);

export const nodePriority = v.union(v.literal("p0"), v.literal("p1"), v.literal("p2"));

export const linkKind = v.union(v.literal("depends_on"), v.literal("serves"));

export const graphView = v.union(
  v.literal("mindmap"),
  v.literal("tree"),
  v.literal("deps"),
);

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    // 该空间子树的根节点；空间刚建好、还没有根节点时为空
    rootNodeId: v.optional(v.id("nodes")),
    createdBy: v.string(),
    createdAt: v.number(),
  }),

  /**
   * 成员资格。userId 为 Better Auth 的用户 id（即 JWT subject）。
   * 邀请时只知道 email，userId 为空；对方首次登录后由 memberships.claimInvites 绑定。
   */
  memberships: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    userId: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_workspace_email", ["workspaceId", "email"]),

  /**
   * API token（为阶段 4 的 MCP 服务器预留）。只存 SHA-256 哈希，明文只在签发时返回一次。
   * 用 token 调用时解析成与网页登录完全相同的 Viewer，权限仍只看 memberships（见 lib/access.ts）。
   */
  apiTokens: defineTable({
    userId: v.string(),
    name: v.string(),
    tokenHash: v.string(),
    /** 明文前几位，方便在列表里认出是哪一个 */
    prefix: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_hash", ["tokenHash"])
    .index("by_user", ["userId"]),

  nodes: defineTable({
    title: v.string(),
    // vision / area / project / task / bullet / note …… 只是可随时修改的标签
    type: v.string(),
    parentId: v.optional(v.id("nodes")),
    // 从根到父的祖先链
    ancestorIds: v.array(v.id("nodes")),
    // 祖先路径字符串 "根id/…/自己id/"，用于子树前缀范围查询（Convex 索引不支持数组包含查询）
    path: v.string(),
    depth: v.number(),
    // 分数索引排序键
    sortKey: v.string(),
    workspaceId: v.id("workspaces"),
    status: v.optional(nodeStatus),
    // 负责人：成员的用户 id，或 "ai"（交给 AI 做，对应 Notion 的 Assignee = AI）
    assigneeId: v.optional(v.string()),
    startDate: v.optional(v.string()), // "YYYY-MM-DD"
    dueDate: v.optional(v.string()), // "YYYY-MM-DD"
    priority: v.optional(nodePriority),
    estimatedHours: v.optional(v.number()),
    actualHours: v.optional(v.number()),
    // 以下两个时间戳只由服务端写，见 convex/lib/status.ts
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    // 进度汇总缓存（子孙中有 status 的节点计数，不含 cancelled）
    rollup: v.optional(v.object({ done: v.number(), total: v.number() })),
    collapsed: v.optional(v.boolean()),
    // 简短备注（表格里的「备注」列，对应 Notion 的 Notes）；长笔记另用 BlockNote
    notes: v.optional(v.string()),
    // 长笔记的纯文本快照，供全文搜索
    noteText: v.optional(v.string()),
    // 软删除：进回收站的时间
    deletedAt: v.optional(v.number()),
    // 阶段 5：Notion 重复导入去重
    notionPageId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parent_sort", ["parentId", "sortKey"])
    .index("by_workspace_path", ["workspaceId", "path"])
    .index("by_workspace_assignee_due", ["workspaceId", "assigneeId", "dueDate"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_completedAt", ["workspaceId", "completedAt"])
    .index("by_notionPageId", ["notionPageId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["workspaceId"],
    })
    .searchIndex("search_note", {
      searchField: "noteText",
      filterFields: ["workspaceId"],
    }),

  nodeLinks: defineTable({
    fromId: v.id("nodes"),
    toId: v.id("nodes"),
    kind: linkKind,
    createdAt: v.number(),
  })
    .index("by_from", ["fromId", "kind"])
    .index("by_to", ["toId", "kind"]),

  // 节点在各张图上的坐标（三张图各自一份）
  nodeLayouts: defineTable({
    nodeId: v.id("nodes"),
    view: graphView,
    x: v.number(),
    y: v.number(),
  }).index("by_node_view", ["nodeId", "view"]),

  comments: defineTable({
    nodeId: v.id("nodes"),
    workspaceId: v.id("workspaces"),
    authorId: v.string(),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_node", ["nodeId"]),

  activityLog: defineTable({
    workspaceId: v.id("workspaces"),
    nodeId: v.id("nodes"),
    actorId: v.string(),
    actorKind: v.union(v.literal("user"), v.literal("ai")),
    action: v.string(),
    changes: v.optional(v.any()),
    at: v.number(),
  })
    .index("by_workspace_at", ["workspaceId", "at"])
    .index("by_node_at", ["nodeId", "at"]),

  viewPrefs: defineTable({
    userId: v.string(),
    view: v.string(),
    settings: v.any(),
  }).index("by_user_view", ["userId", "view"]),
});
