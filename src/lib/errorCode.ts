import { ConvexError } from "convex/values";

/** 后端用 ConvexError({ code }) 报错；示例页直接抛 { code }。取出错误码，给界面按语言显示。 */
export function errorCode(e: unknown): string | undefined {
  if (e instanceof ConvexError && e.data && typeof e.data === "object") {
    return (e.data as { code?: string }).code;
  }
  if (e && typeof e === "object" && "code" in e) return String((e as { code: unknown }).code);
  return undefined;
}
