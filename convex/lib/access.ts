import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { hashApiToken } from "./apiTokens";

/**
 * 公共权限检查 —— 全项目唯一的权限判断入口。
 *
 * 规则（详见 CLAUDE.md「权限规则」）：
 * - 能否读写一个节点，只看当前用户是不是该节点所在工作区的成员。
 * - 不存在与无权访问返回同一个错误（NOT_FOUND），避免用 id 试探私人节点是否存在。
 * - 返回给前端的节点一律经过 redactNode，裁掉读者无权看到的祖先。
 * - 连线：两端节点都可读才可见，两端都可写才可改。
 *
 * 所有公开的 query / mutation 都必须用 lib/functions.ts 的 authedQuery / authedMutation 编写，
 * 它们会先调用 getViewer；任何单节点读写都必须再调用 assertNode。
 */

export type Viewer = {
  userId: string;
  /** 当前用户已绑定成员资格的工作区 */
  workspaceIds: ReadonlySet<Id<"workspaces">>;
  roles: ReadonlyMap<Id<"workspaces">, "owner" | "member">;
};

export const errors = {
  unauthenticated: () => new ConvexError({ code: "UNAUTHENTICATED" }),
  notFound: () => new ConvexError({ code: "NOT_FOUND" }),
  forbidden: () => new ConvexError({ code: "FORBIDDEN" }),
};

/** 当前登录用户的 id（Better Auth 用户 id = JWT subject），未登录返回 null */
export async function getUserId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** 取当前用户及其成员资格；未登录抛 UNAUTHENTICATED。没有任何成员资格不报错，只是什么都看不到。 */
export async function getViewer(ctx: QueryCtx): Promise<Viewer> {
  const userId = await getUserId(ctx);
  if (!userId) throw errors.unauthenticated();
  return await viewerForUserId(ctx, userId);
}

/**
 * 用 API token 认证（为 MCP 的 HTTP action 预留）：解析成与网页登录相同的 Viewer。
 * token 不存在、已吊销，一律抛 UNAUTHENTICATED。之后的读写照常走 assertNode / assertWorkspace。
 */
export async function getViewerFromApiToken(
  ctx: QueryCtx,
  rawToken: string,
): Promise<Viewer> {
  const tokenHash = await hashApiToken(rawToken.trim());
  const token = await ctx.db
    .query("apiTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!token || token.revokedAt !== undefined) throw errors.unauthenticated();
  return await viewerForUserId(ctx, token.userId);
}

async function viewerForUserId(ctx: QueryCtx, userId: string): Promise<Viewer> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return {
    userId,
    workspaceIds: new Set(memberships.map((m) => m.workspaceId)),
    roles: new Map(memberships.map((m) => [m.workspaceId, m.role])),
  };
}

export function canAccessWorkspace(
  viewer: Viewer,
  workspaceId: Id<"workspaces">,
): boolean {
  return viewer.workspaceIds.has(workspaceId);
}

export function assertWorkspace(
  viewer: Viewer,
  workspaceId: Id<"workspaces">,
  role: "member" | "owner" = "member",
): void {
  if (!canAccessWorkspace(viewer, workspaceId)) throw errors.notFound();
  if (role === "owner" && viewer.roles.get(workspaceId) !== "owner") {
    throw errors.forbidden();
  }
}

/** 读写单个节点前必须调用。回收站里的节点视为不存在。 */
export async function assertNode(
  ctx: QueryCtx,
  viewer: Viewer,
  nodeId: Id<"nodes">,
): Promise<Doc<"nodes">> {
  const node = await ctx.db.get(nodeId);
  if (!node || node.deletedAt !== undefined) throw errors.notFound();
  if (!canAccessWorkspace(viewer, node.workspaceId)) throw errors.notFound();
  return node;
}

/** 连线两端都必须对读者可见，否则视为不存在。 */
export async function assertLink(
  ctx: QueryCtx,
  viewer: Viewer,
  linkId: Id<"nodeLinks">,
): Promise<Doc<"nodeLinks">> {
  const link = await ctx.db.get(linkId);
  if (!link) throw errors.notFound();
  await assertNode(ctx, viewer, link.fromId);
  await assertNode(ctx, viewer, link.toId);
  return link;
}

/** 前端拿到的节点形状：祖先链只保留读者有权看到的那一段。 */
export type VisibleNode = Doc<"nodes">;

/**
 * 裁掉读者无权看到的祖先。
 *
 * 挂载规则保证「父空间成员 ⊆ 子空间成员」，所以从根往下看，读者不可见的祖先一定是连续的前缀。
 * 这里按祖先所在工作区逐个判断，取第一个可见祖先之后的部分。
 */
export async function redactNode(
  ctx: QueryCtx,
  viewer: Viewer,
  node: Doc<"nodes">,
  cache: Map<Id<"nodes">, Id<"workspaces"> | null> = new Map(),
): Promise<VisibleNode> {
  let firstVisible = node.ancestorIds.length;
  for (let i = node.ancestorIds.length - 1; i >= 0; i--) {
    const ancestorId = node.ancestorIds[i];
    let ws = cache.get(ancestorId);
    if (ws === undefined) {
      const ancestor = await ctx.db.get(ancestorId);
      ws = ancestor ? ancestor.workspaceId : null;
      cache.set(ancestorId, ws);
    }
    if (ws === null || !canAccessWorkspace(viewer, ws)) break;
    firstVisible = i;
  }
  if (firstVisible === 0) return node;

  const visibleAncestors = node.ancestorIds.slice(firstVisible);
  const segments = node.path.split("/").filter(Boolean);
  return {
    ...node,
    parentId: visibleAncestors.length > 0 ? node.parentId : undefined,
    ancestorIds: visibleAncestors,
    path: segments.slice(firstVisible).join("/") + "/",
    // depth 也会泄露上面有几层私人祖先，一并改成相对可见部分的深度
    depth: node.depth - firstVisible,
  };
}
