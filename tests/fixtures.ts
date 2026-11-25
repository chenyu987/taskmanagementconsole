/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { positionUnder } from "../convex/lib/tree";

export const modules = import.meta.glob("../convex/**/*.ts");

/** 写进所有私人节点的哨兵字符串：cxuq 的任何返回值里出现它，测试就失败 */
export const SECRET = "SECRET-7f3a";

export const LYC = { subject: "user_lyc", email: "lyc@example.com" };
export const CXUQ = { subject: "user_cxuq", email: "cxuq@example.com" };
export const STRANGER = { subject: "user_stranger", email: "x@example.com" };

/**
 * 标准场景：
 *   私人空间（只有 lyc）： 人生 → 健康（含哨兵）
 *                          人生 → EverHarvest 根（EverHarvest 空间）→ 雪票采购
 */
export async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.bootstrap, {
    ownerEmail: LYC.email,
    teamEmails: [CXUQ.email],
  });

  const ids = await t.run(async (ctx) => {
    // 模拟两人登录后认领邀请
    for (const m of await ctx.db.query("memberships").collect()) {
      const userId = m.email === LYC.email ? LYC.subject : CXUQ.subject;
      await ctx.db.patch(m._id, { userId });
    }
    const workspaces = await ctx.db.query("workspaces").collect();
    const personalWs = workspaces.find((w) => w.name === "私人")!;
    const teamWs = workspaces.find((w) => w.name === "EverHarvest")!;
    const personalRoot = (await ctx.db.get(personalWs.rootNodeId!))!;
    const teamRoot = (await ctx.db.get(teamWs.rootNodeId!))!;

    const now = Date.now();
    const addChild = async (
      parent: typeof personalRoot,
      title: string,
      workspaceId: Id<"workspaces">,
    ) => {
      const id = await ctx.db.insert("nodes", {
        title,
        type: "task",
        parentId: parent._id,
        ancestorIds: [],
        path: "",
        depth: 0,
        sortKey: "a1",
        workspaceId,
        noteText: workspaceId === personalWs._id ? SECRET : undefined,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(id, positionUnder(parent, id));
      return id;
    };

    await ctx.db.patch(personalRoot._id, { title: `人生 ${SECRET}` });
    const personalChild = await addChild(
      personalRoot,
      `健康 ${SECRET}`,
      personalWs._id,
    );
    const teamChild = await addChild(teamRoot, "雪票采购", teamWs._id);

    return {
      personalWs: personalWs._id,
      teamWs: teamWs._id,
      personalRoot: personalRoot._id,
      teamRoot: teamRoot._id,
      personalChild,
      teamChild,
    };
  });

  return {
    t,
    ids,
    lyc: t.withIdentity(LYC),
    cxuq: t.withIdentity(CXUQ),
    stranger: t.withIdentity(STRANGER),
  };
}

function errorCode(e: unknown): string | undefined {
  const err = e as { data?: unknown; message?: string };
  if (err.data && typeof err.data === "object") {
    return (err.data as { code?: string }).code;
  }
  try {
    return JSON.parse(String(err.message ?? "")).code;
  } catch {
    return String(err.message ?? "").match(/"code":"(\w+)"/)?.[1];
  }
}

/** 断言调用以指定错误码失败 */
export async function expectError(
  promise: Promise<unknown>,
  code: "NOT_FOUND" | "UNAUTHENTICATED" | "FORBIDDEN",
) {
  let caught: unknown;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  expect(caught, `应当以 ${code} 失败，但调用成功了`).toBeDefined();
  expect(errorCode(caught)).toBe(code);
}

/** 断言返回值里不含任何私人内容：哨兵字符串和私人节点 id 都不能出现 */
export function expectNoPrivateData(
  value: unknown,
  privateIds: readonly string[],
) {
  const json = JSON.stringify(value);
  expect(json).not.toContain(SECRET);
  for (const id of privateIds) expect(json).not.toContain(id);
}
