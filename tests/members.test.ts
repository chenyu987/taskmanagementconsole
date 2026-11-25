import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { CXUQ, LYC, expectError, expectNoPrivateData, setup } from "./fixtures";

function codeOf(e: unknown) {
  const err = e as { data?: { code?: string }; message?: string };
  return err.data?.code ?? String(err.message).match(/"code":"(\w+)"/)?.[1];
}
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught, `应当以 ${code} 失败`).toBeDefined();
  expect(codeOf(caught)).toBe(code);
}

describe("成员管理", () => {
  test("LYC 能看到两个空间的成员；cxuq 只能看到 EverHarvest 的", async () => {
    const { lyc, cxuq, ids } = await setup();
    const team = await lyc.query(api.members.list, { workspaceId: ids.teamWs });
    expect(team.map((m) => m.email)).toEqual([LYC.email, CXUQ.email]);
    const personal = await lyc.query(api.members.list, { workspaceId: ids.personalWs });
    expect(personal.map((m) => m.email)).toEqual([LYC.email]);

    const asCxuq = await cxuq.query(api.members.list, { workspaceId: ids.teamWs });
    expect(asCxuq.find((m) => m.isMe)?.email).toBe(CXUQ.email);
    await expectError(cxuq.query(api.members.list, { workspaceId: ids.personalWs }), "NOT_FOUND");
  });

  test("owner 邀请新成员；重复邀请报 ALREADY_MEMBER", async () => {
    const { lyc, ids } = await setup();
    await lyc.mutation(api.members.invite, { workspaceId: ids.teamWs, email: " New@Example.com " });
    const team = await lyc.query(api.members.list, { workspaceId: ids.teamWs });
    expect(team.find((m) => m.email === "new@example.com")).toMatchObject({ joined: false, role: "member" });
    await expectCode(
      lyc.mutation(api.members.invite, { workspaceId: ids.teamWs, email: "new@example.com" }),
      "ALREADY_MEMBER",
    );
  });

  test("普通成员不能邀请、移除、改角色；碰私人空间一律 NOT_FOUND", async () => {
    const { lyc, cxuq, ids } = await setup();
    await expectError(
      cxuq.mutation(api.members.invite, { workspaceId: ids.teamWs, email: "x@y.z" }),
      "FORBIDDEN",
    );
    await expectError(
      cxuq.mutation(api.members.invite, { workspaceId: ids.personalWs, email: CXUQ.email }),
      "NOT_FOUND",
    );
    const personal = await lyc.query(api.members.list, { workspaceId: ids.personalWs });
    await expectError(cxuq.mutation(api.members.remove, { membershipId: personal[0]._id }), "NOT_FOUND");
    await expectError(
      cxuq.mutation(api.members.setRole, { membershipId: personal[0]._id, role: "member" }),
      "NOT_FOUND",
    );
  });

  test("挂载规则：私人空间的成员必须也在 EverHarvest", async () => {
    const { lyc, ids } = await setup();
    // 私人空间是 EverHarvest 的父空间：加进私人空间的人必须已经是 EverHarvest 成员
    await expectCode(
      lyc.mutation(api.members.invite, { workspaceId: ids.personalWs, email: "outsider@example.com" }),
      "MOUNT_RULE",
    );
    // 反过来：LYC 在私人空间里，所以不能把他从 EverHarvest 移除
    const team = await lyc.query(api.members.list, { workspaceId: ids.teamWs });
    const lycInTeam = team.find((m) => m.email === LYC.email)!;
    await lyc.mutation(api.members.setRole, { membershipId: team.find((m) => m.email === CXUQ.email)!._id, role: "owner" });
    await expectCode(lyc.mutation(api.members.remove, { membershipId: lycInTeam._id }), "MOUNT_RULE");
  });

  test("移除成员后对方立刻什么都看不到；最后一个 owner 不能降级或移除", async () => {
    const { lyc, cxuq, ids } = await setup();
    const team = await lyc.query(api.members.list, { workspaceId: ids.teamWs });
    const personal = await lyc.query(api.members.list, { workspaceId: ids.personalWs });
    await expectCode(lyc.mutation(api.members.remove, { membershipId: personal[0]._id }), "LAST_OWNER");
    await expectCode(
      lyc.mutation(api.members.setRole, { membershipId: personal[0]._id, role: "member" }),
      "LAST_OWNER",
    );

    await lyc.mutation(api.members.remove, { membershipId: team.find((m) => m.email === CXUQ.email)!._id });
    const me = await cxuq.query(api.viewer.me, {});
    expect(me.workspaces).toEqual([]);
    await expectError(cxuq.query(api.nodes.get, { nodeId: ids.teamRoot }), "NOT_FOUND");
    expectNoPrivateData(me, [ids.personalWs]);
  });
});
