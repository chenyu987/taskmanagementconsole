import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
// 全项目只有这个文件可以导入裸 query / mutation（ESLint 和 tests/wrapperGuard.test.ts 会检查）
import { mutation, query } from "../_generated/server";
import { getViewer } from "./access";

/** 需要登录的 query：ctx.viewer 已注入，未登录直接抛 UNAUTHENTICATED。 */
export const authedQuery = customQuery(
  query,
  customCtx(async (ctx) => ({ viewer: await getViewer(ctx) })),
);

/** 需要登录的 mutation：ctx.viewer 已注入，未登录直接抛 UNAUTHENTICATED。 */
export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx) => ({ viewer: await getViewer(ctx) })),
);
