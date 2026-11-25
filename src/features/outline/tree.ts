/** 大纲用的纯函数：把服务端给的扁平节点列表组装成树、算出可见行。不依赖 React，方便测试。 */

export type Status = "backlog" | "pending" | "in_progress" | "blocked" | "done" | "cancelled";

export type OutlineNode = {
  _id: string;
  parentId?: string;
  title: string;
  type: string;
  sortKey: string;
  workspaceId: string;
  status?: Status;
  collapsed?: boolean;
  rollup?: { done: number; total: number };
};

export type Tree = {
  byId: Map<string, OutlineNode>;
  children: Map<string, OutlineNode[]>;
};

/** 多个顶层节点时（属于互不相连的空间）挂在这个虚拟根下 */
export const VIRTUAL_ROOT = "__top__";

export function buildTree(nodes: readonly OutlineNode[], rootIds: readonly string[]): Tree {
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const children = new Map<string, OutlineNode[]>();
  const top = new Set(rootIds);
  for (const n of nodes) {
    const parent = top.has(n._id) || !n.parentId || !byId.has(n.parentId) ? VIRTUAL_ROOT : n.parentId;
    if (parent === VIRTUAL_ROOT && !top.has(n._id)) continue;
    const list = children.get(parent) ?? [];
    list.push(n);
    children.set(parent, list);
  }
  // 分数索引的排序键按码位比较，不能用 localeCompare
  for (const list of children.values()) list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return { byId, children };
}

export type Row = { node: OutlineNode; depth: number; hasChildren: boolean };

/** 从 rootId 往下，跳过折叠节点的子孙，得到屏幕上从上到下的行。 */
export function visibleRows(tree: Tree, rootId: string): Row[] {
  const rows: Row[] = [];
  const walk = (id: string, depth: number) => {
    for (const node of tree.children.get(id) ?? []) {
      const hasChildren = (tree.children.get(node._id)?.length ?? 0) > 0;
      rows.push({ node, depth, hasChildren });
      if (hasChildren && !node.collapsed) walk(node._id, depth + 1);
    }
  };
  walk(rootId, 0);
  return rows;
}

export function siblingsOf(tree: Tree, node: OutlineNode): OutlineNode[] {
  return tree.children.get(parentKey(tree, node)) ?? [];
}

export function parentKey(tree: Tree, node: OutlineNode): string {
  return node.parentId && tree.byId.has(node.parentId) ? node.parentId : VIRTUAL_ROOT;
}

/** 面包屑：从顶层到 id 的父节点（只含读者看得到的部分） */
export function ancestorsOf(tree: Tree, id: string): OutlineNode[] {
  const chain: OutlineNode[] = [];
  let cur = tree.byId.get(id)?.parentId;
  while (cur && tree.byId.has(cur)) {
    const n = tree.byId.get(cur)!;
    chain.unshift(n);
    cur = n.parentId;
  }
  return chain;
}

/** 高层节点（愿景、领域、项目）的标题用书卷气的标题字体（DESIGN.md「字体」） */
export const DISPLAY_TYPES = new Set(["vision", "area", "project"]);
