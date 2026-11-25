# 0002 登录用 Better Auth

日期：2026-11-25 · 状态：已采纳（阶段 0 验证）

## 选项

- Clerk：官方集成成熟、上手最快；用户数据在 Clerk，绑定 SaaS；阶段 4 MCP 需另做 OAuth。
- Better Auth（`@convex-dev/better-auth` 组件）：开源，用户数据在自己的 Convex，和节点一起导出；有 OAuth 提供方 / MCP 相关插件。

## 决定

用 Better Auth，只开 Google 登录。Convex 端通过 JWT 的 `subject`（= Better Auth 用户 id）识别用户，权限层只依赖 `ctx.auth.getUserIdentity()`，因此测试可以直接模拟身份，将来换登录方案也只影响 `convex/auth*.ts`。

## 回退

如果 Convex 组件在阶段 0 验收时有阻塞问题，改用 Clerk。
