import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorCode } from "@/lib/errorCode";
import { MembersView, memberErrorText } from "./MembersView";

/** 空间与成员（真数据）。路由：#/members */
export function MembersPage({ onBack }: { onBack: () => void }) {
  const me = useQuery(api.viewer.me);
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = picked ?? me?.workspaces[0]?._id ?? null;
  const members = useQuery(
    api.members.list,
    selectedId ? { workspaceId: selectedId as Id<"workspaces"> } : "skip",
  );
  const invite = useMutation(api.members.invite);
  const remove = useMutation(api.members.remove);
  const setRole = useMutation(api.members.setRole);

  const attempt = async (fn: () => Promise<unknown>, action: "invite" | "remove" | "role") => {
    try {
      await fn();
      return null;
    } catch (e) {
      return memberErrorText(errorCode(e), action);
    }
  };

  return (
    <MembersView
      workspaces={me?.workspaces ?? []}
      selectedId={selectedId}
      onSelect={setPicked}
      members={members}
      onBack={onBack}
      onInvite={(email, role) =>
        attempt(
          () => invite({ workspaceId: selectedId as Id<"workspaces">, email, role }),
          "invite",
        )
      }
      onRemove={(id) =>
        attempt(() => remove({ membershipId: id as Id<"memberships"> }), "remove")
      }
      onSetRole={(id, role) =>
        attempt(() => setRole({ membershipId: id as Id<"memberships">, role }), "role")
      }
    />
  );
}
