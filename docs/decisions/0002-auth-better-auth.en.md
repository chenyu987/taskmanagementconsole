# 0002 Sign-in with Better Auth

Date: 2026-11-25 · Status: accepted (validated in phase 0) · [中文](./0002-auth-better-auth.md)

## Options

- Clerk: mature official integration, fastest to start; user data lives in Clerk, tied to a SaaS; phase 4 MCP would need separate OAuth.
- Better Auth (the `@convex-dev/better-auth` component): open source, user data lives in our own Convex and exports with the nodes; has OAuth provider / MCP-related plugins.

## Decision

Use Better Auth. Convex identifies the user by the JWT `subject` (= the Better Auth user id), and the permission layer depends only on `ctx.auth.getUserIdentity()`. Tests can therefore simulate identities directly, and changing the sign-in method later only touches `convex/auth*.ts`.

## Update (2026-11-25): no Clerk; email + password first

- Why: LYC and cxuq usually use a VPN, and Clerk's risk checks block VPN sign-ins. cxuq is in China and can't depend on third-party sign-in services. So Clerk is no longer a fallback.
- Sign-in: email + password first; Google and GitHub are optional and come later.
- No public sign-up: only emails with an unclaimed invite in `memberships` can register (`databaseHooks.user.create.before`). The email is marked verified at sign-up (the invite is the verification). Known risk: with no email verification, whoever registers an invited email first claims the invite; this gets fixed once an email service is added.
- Sessions last 90 days and renew with daily use, for the phone PWA.
- API tokens reserved for phase 4 MCP: the `apiTokens` table stores only SHA-256 hashes, and `getViewerFromApiToken` in `lib/access.ts` resolves the same `Viewer` as a web sign-in, so there is only one set of permission rules.
