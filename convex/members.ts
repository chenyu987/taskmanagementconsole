import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertWorkspace } from "./lib/access";
import { normalizeEmail } from "./lib/email";
import { authedMutation, authedQuery } from "./lib/functions";

/**
 * 成员管理：LYC 在界面里决定每个人能看哪些空间（CLAUDE.md「LYC 看全部、cxuq 只看公司」）。
 *
 * - 任何成员都能看到本空间的成员列表；不是成员一律 NOT_FOUND（看不到私人空间有谁）。
 * - 邀请、移除、改角色只有该空间的 owner 能做（FORBIDDEN）。
 * - 挂载规则（权限规则 6）：父空间成员 ⊆ 子空间成员。
 *   往父空间加人前，这个人必须已经在挂在它下面的每个子空间里；
 *   从子空间移除一个人前，他不能还在父空间里。
 * - 每个空间至少保留一个已加入的 owner。
 */

const role = v.union(v.literal("owner"), v.literal("member"));

function fail(code: string): never {
  throw new ConvexError({ code });
}

async function rootParentWorkspace(
  ctx: QueryCtx,
  ws: Doc<"workspaces">,
): Promise<Id<"workspaces"> | null> {
  if (!ws.rootNodeId) return null;
  const root = await ctx.db.get(ws.rootNodeId);
  if (!root?.parentId) return null;
  const parent = await ctx.db.get(root.parentId);
  return parent?.workspaceId ?? null;
}

/** 根节点直接挂在 workspaceId 某个节点下面的子空间。工作区只有寥寥几个，直接遍历。 */
async function childWorkspaces(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const result: Doc<"workspaces">[] = [];
  for (const ws of await ctx.db.query("workspaces").collect()) {
    if (ws._id !== workspaceId && (await rootParentWorkspace(ctx, ws)) === workspaceId) {
      result.push(ws);
    }
  }
  return result;
}

async function membershipFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, email: string) {
  return await ctx.db
    .query("memberships")
    .withIndex("by_workspace_email", (q) => q.eq("workspaceId", workspaceId).eq("email", email))
    .first();
}

async function assertNotLastOwner(ctx: QueryCtx, m: Doc<"memberships">) {
  if (m.role !== "owner" || m.userId === undefined) return;
  const all = await ctx.db
    .query("memberships")
    .withIndex("by_workspace_email", (q) => q.eq("workspaceId", m.workspaceId))
    .collect();
  const owners = all.filter((x) => x.role === "owner" && x.userId !== undefined);
  if (owners.length <= 1) fail("LAST_OWNER");
}

export const list = authedQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    assertWorkspace(ctx.viewer, workspaceId);
    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_workspace_email", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return rows
      .map((m) => ({
        _id: m._id,
        email: m.email,
        role: m.role,
        joined: m.userId !== undefined,
        isMe: m.userId === ctx.viewer.userId,
      }))
      .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === "owner" ? -1 : 1));
  },
});

export const invite = authedMutation({
  args: { workspaceId: v.id("workspaces"), email: v.string(), role: v.optional(role) },
  handler: async (ctx, { workspaceId, email, role }) => {
    assertWorkspace(ctx.viewer, workspaceId, "owner");
    const target = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) fail("INVALID_EMAIL");
    if (await membershipFor(ctx, workspaceId, target)) fail("ALREADY_MEMBER");
    for (const child of await childWorkspaces(ctx, workspaceId)) {
      if (!(await membershipFor(ctx, child._id, target))) fail("MOUNT_RULE");
    }
    return await ctx.db.insert("memberships", {
      workspaceId,
      email: target,
      role: role ?? "member",
      createdAt: Date.now(),
    });
  },
});

export const remove = authedMutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, { membershipId }) => {
    const m = await ctx.db.get(membershipId);
    if (!m) fail("NOT_FOUND");
    assertWorkspace(ctx.viewer, m.workspaceId, "owner");
    await assertNotLastOwner(ctx, m);
    const ws = (await ctx.db.get(m.workspaceId))!;
    const parentId = await rootParentWorkspace(ctx, ws);
    if (parentId && (await membershipFor(ctx, parentId, m.email))) fail("MOUNT_RULE");
    await ctx.db.delete(membershipId);
  },
});

export const setRole = authedMutation({
  args: { membershipId: v.id("memberships"), role },
  handler: async (ctx, { membershipId, role }) => {
    const m = await ctx.db.get(membershipId);
    if (!m) fail("NOT_FOUND");
    assertWorkspace(ctx.viewer, m.workspaceId, "owner");
    if (m.role === role) return;
    if (role === "member") await assertNotLastOwner(ctx, m);
    await ctx.db.patch(membershipId, { role });
  },
});
