import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { OutlineView, type OutlineActions } from "./OutlineView";

type NodeId = Id<"nodes">;

/** 大纲（真数据）。路由：#/outline，放大到某一项：#/outline/<节点 id> */
export function OutlinePage({
  zoomId,
  onZoom,
  onBack,
}: {
  zoomId: string | null;
  onZoom: (id: string | null) => void;
  onBack: () => void;
}) {
  const data = useQuery(api.nodes.outline);
  const me = useQuery(api.viewer.me);
  const create = useMutation(api.nodes.create);
  const update = useMutation(api.nodes.update).withOptimisticUpdate((store, args) => {
    // 折叠、改状态、改类型立刻生效，不等服务器
    const cur = store.getQuery(api.nodes.outline, {});
    if (!cur) return;
    const { nodeId, ...patch } = args;
    store.setQuery(api.nodes.outline, {}, {
      ...cur,
      nodes: cur.nodes.map((n) =>
        n._id === nodeId
          ? {
              ...n,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.type !== undefined && { type: patch.type }),
              ...(patch.collapsed !== undefined && { collapsed: patch.collapsed }),
              ...(patch.status !== undefined && { status: patch.status ?? undefined }),
            }
          : n,
      ),
    });
  });
  const move = useMutation(api.nodes.move);
  const remove = useMutation(api.nodes.remove);
  const restore = useMutation(api.nodes.restore);

  const workspaces = useMemo(
    () => Object.fromEntries((me?.workspaces ?? []).map((w) => [w._id, w.name])),
    [me],
  );

  const actions: OutlineActions = useMemo(
    () => ({
      create: (parentId, afterId, title) =>
        create({ parentId: parentId as NodeId, afterId: afterId as NodeId | null | undefined, title }),
      update: async (id, patch) => {
        await update({ nodeId: id as NodeId, ...patch });
      },
      move: async (id, parentId, afterId) => {
        await move({ nodeId: id as NodeId, parentId: parentId as NodeId, afterId: afterId as NodeId | null | undefined });
      },
      remove: async (id) => {
        await remove({ nodeId: id as NodeId });
      },
      restore: async (id) => {
        await restore({ nodeId: id as NodeId });
      },
    }),
    [create, update, move, remove, restore],
  );

  return (
    <OutlineView
      rootIds={data?.rootIds ?? []}
      nodes={data?.nodes}
      workspaces={workspaces}
      zoomId={zoomId}
      onZoom={onZoom}
      actions={actions}
      onBack={onBack}
    />
  );
}
