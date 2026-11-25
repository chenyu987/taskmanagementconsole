import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { liveChildren } from "./order";

type Rollup = NonNullable<Doc<"nodes">["rollup"]>;

/** 一个子节点对父节点汇总的贡献：自己（有状态且不是 cancelled 时算一个）+ 它的汇总。 */
function contribution(child: Doc<"nodes">): Rollup {
  const self = child.status !== undefined && child.status !== "cancelled";
  return {
    done: (self && child.status === "done" ? 1 : 0) + (child.rollup?.done ?? 0),
    total: (self ? 1 : 0) + (child.rollup?.total ?? 0),
  };
}

/**
 * 从 startId 开始沿祖先链往上重算进度汇总缓存（CLAUDE.md「rollup」）。
 * 传入「变化的节点的父节点」。状态变化、新建、移动、删除、恢复后都要调用。挂载规则保证汇总里不会混入读者看不到的东西。
 */
export async function refreshRollups(ctx: MutationCtx, startId: Id<"nodes"> | undefined) {
  let id = startId;
  while (id) {
    const node = await ctx.db.get(id);
    if (!node) return;
    let done = 0;
    let total = 0;
    for (const child of await liveChildren(ctx, id)) {
      const c = contribution(child);
      done += c.done;
      total += c.total;
    }
    const next = total > 0 ? { done, total } : undefined;
    // 这一层没变，上面各层也不会变
    if (next?.done === node.rollup?.done && next?.total === node.rollup?.total) return;
    await ctx.db.patch(id, { rollup: next });
    id = node.parentId;
  }
}
