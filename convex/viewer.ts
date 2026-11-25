import { authedQuery } from "./lib/functions";

/** 当前用户与其所属的工作区。没有任何成员资格时 workspaces 为空。 */
export const me = authedQuery({
  args: {},
  handler: async (ctx) => {
    const workspaces = [];
    for (const workspaceId of ctx.viewer.workspaceIds) {
      const ws = await ctx.db.get(workspaceId);
      if (!ws) continue;
      workspaces.push({
        _id: ws._id,
        name: ws.name,
        rootNodeId: ws.rootNodeId,
        role: ctx.viewer.roles.get(workspaceId)!,
      });
    }
    workspaces.sort((a, b) => a.name.localeCompare(b.name));
    return { userId: ctx.viewer.userId, workspaces };
  },
});
