import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TasksView, type TasksActions } from "./TasksView";

/** 多维表格（真数据）。路由：#/tasks */
export function TasksPage({ onBack }: { onBack: () => void }) {
  const tasks = useQuery(api.tasks.list);
  const people = useQuery(api.tasks.people);
  const me = useQuery(api.viewer.me);
  const update = useMutation(api.nodes.update).withOptimisticUpdate((store, args) => {
    // 改状态、负责人、优先级等立刻生效，不等服务器
    const cur = store.getQuery(api.tasks.list, {});
    if (!cur) return;
    const { nodeId, ...patch } = args;
    const fields = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined]));
    store.setQuery(api.tasks.list, {}, cur.map((r) => (r._id === nodeId ? { ...r, ...fields } : r)));
  });
  const create = useMutation(api.nodes.create);
  const addDependency = useMutation(api.links.addDependency);
  const removeDependency = useMutation(api.links.remove);

  const workspaces = useMemo(() => me?.workspaces ?? [], [me]);

  const actions: TasksActions = useMemo(
    () => ({
      update: async (id, patch) => {
        await update({ nodeId: id as Id<"nodes">, ...patch });
      },
      create: async (workspaceId, title, patch) => {
        const ws = workspaces.find((w) => w._id === workspaceId);
        if (!ws?.rootNodeId) return;
        await create({
          parentId: ws.rootNodeId,
          title,
          type: "task",
          status: patch.status ?? "pending",
          ...(patch.assigneeId ? { assigneeId: patch.assigneeId } : {}),
        });
      },
      addDependency: async (fromId, toId) => {
        await addDependency({ fromId: fromId as Id<"nodes">, toId: toId as Id<"nodes"> });
      },
      removeDependency: async (linkId) => {
        await removeDependency({ linkId: linkId as Id<"nodeLinks"> });
      },
    }),
    [update, create, addDependency, removeDependency, workspaces],
  );

  return (
    <TasksView
      tasks={tasks}
      people={people ?? []}
      workspaces={workspaces}
      actions={actions}
      onBack={onBack}
    />
  );
}
