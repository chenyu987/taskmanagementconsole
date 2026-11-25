import type { Doc, Id } from "../_generated/dataModel";

/** 节点在树里的位置字段，由父节点推出。 */
export function positionUnder(
  parent: Pick<Doc<"nodes">, "_id" | "ancestorIds" | "path" | "depth"> | null,
  nodeId: Id<"nodes">,
): { ancestorIds: Id<"nodes">[]; path: string; depth: number } {
  if (!parent) return { ancestorIds: [], path: `${nodeId}/`, depth: 0 };
  return {
    ancestorIds: [...parent.ancestorIds, parent._id],
    path: `${parent.path}${nodeId}/`,
    depth: parent.depth + 1,
  };
}

/** 子树前缀范围查询的上界：path 以 prefix 开头的字符串都 < prefix + "￿"。 */
export function subtreeUpperBound(path: string): string {
  return `${path}￿`;
}

/**
 * 挂载规则：一个工作区的根节点只能挂在「成员是它子集」的工作区节点下面，
 * 这样任何人能看到的节点，其子孙和进度汇总里都不会混入他看不到的东西。
 */
export function canMountWorkspace(
  parentWorkspaceMembers: ReadonlySet<string>,
  childWorkspaceMembers: ReadonlySet<string>,
): boolean {
  for (const m of parentWorkspaceMembers) {
    if (!childWorkspaceMembers.has(m)) return false;
  }
  return true;
}
