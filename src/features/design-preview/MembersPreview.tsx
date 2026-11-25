import { useState } from "react";
import { MembersView, type MemberItem, type WorkspaceItem } from "@/features/members/MembersView";

/** 设计确认 / 截图用：空间与成员页的样例数据。打开方式：本地 /?preview=members */
const WORKSPACES: WorkspaceItem[] = [
  { _id: "ws-team", name: "EverHarvest", role: "owner" },
  { _id: "ws-personal", name: "私人", role: "owner" },
];

const MEMBERS: Record<string, MemberItem[]> = {
  "ws-team": [
    { _id: "m1", email: "lucas@example.com", role: "owner", joined: true, isMe: true },
    { _id: "m2", email: "team@everharvest.example", role: "member", joined: true, isMe: false },
    { _id: "m3", email: "newhire@everharvest.example", role: "member", joined: false, isMe: false },
  ],
  "ws-personal": [{ _id: "m4", email: "lucas@example.com", role: "owner", joined: true, isMe: true }],
};

export default function MembersPreview() {
  const [selected, setSelected] = useState("ws-team");
  return (
    <MembersView
      workspaces={WORKSPACES}
      selectedId={selected}
      onSelect={setSelected}
      members={MEMBERS[selected]}
      onBack={() => {}}
      onInvite={async () => null}
      onRemove={async () => null}
      onSetRole={async () => null}
    />
  );
}
