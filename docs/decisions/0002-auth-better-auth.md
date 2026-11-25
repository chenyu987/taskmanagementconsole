# 0002 登录用 Better Auth

日期：2026-11-25 · 状态：已采纳（阶段 0 验证） · [English](./0002-auth-better-auth.en.md)

## 选项

- Clerk：官方集成成熟、上手最快；用户数据在 Clerk，绑定 SaaS；阶段 4 MCP 需另做 OAuth。
- Better Auth（`@convex-dev/better-auth` 组件）：开源，用户数据在自己的 Convex，和节点一起导出；有 OAuth 提供方 / MCP 相关插件。

## 决定

用 Better Auth。Convex 端通过 JWT 的 `subject`（= Better Auth 用户 id）识别用户，权限层只依赖 `ctx.auth.getUserIdentity()`，因此测试可以直接模拟身份，将来换登录方案也只影响 `convex/auth*.ts`。

## 更新（2026-11-25）：不用 Clerk，第一版邮箱 + 密码

- 原因：LYC 和 cxuq 平时都用 VPN，Clerk 的风控会拦截 VPN 登录；cxuq 在中国，不能依赖第三方登录服务。因此不再把 Clerk 当回退方案。
- 登录方式：邮箱 + 密码为主；Google 和 GitHub 作为可选，以后再加。
- 不公开注册：只有 `memberships` 里有未认领邀请的邮箱才能注册（`databaseHooks.user.create.before`）。注册时直接标记邮箱已验证（邀请即验证）。已知风险：没有发信验证，谁先用被邀请的邮箱注册谁就拿到邀请；以后接入发信服务再补。
- 会话 90 天，每天使用自动续期，方便手机 PWA。
- 为阶段 4 的 MCP 预留 API token：`apiTokens` 表只存 SHA-256，`lib/access.ts` 的 `getViewerFromApiToken` 解析出与网页登录相同的 `Viewer`，权限规则只有一套。
