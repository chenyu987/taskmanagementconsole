/** API token 的格式与哈希。明文形如 `tmc_<43 位 base64url>`，数据库只存 SHA-256。 */
export const API_TOKEN_PREFIX = "tmc_";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** 生成新 token 明文。只能在 action 里调用：query / mutation 里的随机数是确定性的，不安全。 */
export function generateApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return API_TOKEN_PREFIX + toBase64Url(bytes);
}

export async function hashApiToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
