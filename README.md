# Life OS

**English** · [中文](./README.zh-CN.md)

A personal and team task system built for the long run: everything is a node, from a life vision down to the smallest bullet point. It serves both LYC's private life and the EverHarvest team (a North American ski-ticket business). Team members only see the spaces they are invited to.

- Architecture, permission rules and key decisions: [CLAUDE.en.md](./CLAUDE.en.md) (English) / [CLAUDE.md](./CLAUDE.md) (Chinese, authoritative)
- Visual design rules: [DESIGN.en.md](./DESIGN.en.md) ([中文](./DESIGN.md))
- Decision records: [`docs/decisions/`](./docs/decisions/) (English versions are `*.en.md`)

The app UI is available in Chinese and English (switch in the top-right corner). Repository docs are bilingual too: when you change one language, update the other in the same PR.

## Stack

Convex (database, functions, realtime sync, search) · Better Auth (email + password, invite-only) · React + TypeScript + Vite · Tailwind v4 · Lingui (i18n) · Cloudflare Workers (static frontend hosting)

## First-time setup

1. **Convex**: `npm install && npx convex dev`. Sign in and create a project (this creates a dev deployment and `.env.local`).
2. **Backend variables**:
   ```bash
   npx convex env set SITE_URL http://localhost:5173
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   ```
   Then add `VITE_CONVEX_SITE_URL=https://<your-deployment>.convex.site` to `.env.local`.
3. **Create the workspaces and send the first invites** (run once; running again creates nothing new):
   ```bash
   npx convex run admin:bootstrap '{"ownerEmail":"you@example.com","teamEmails":["teammate@example.com"]}'
   ```
4. Run `npm run dev`, open http://localhost:5173, choose "Invited and new here? Set a password", and set a password for the invited email.
   Sign-up is invite-only: emails without an invite are rejected. Register soon after inviting someone, because there is no email verification yet (whoever registers an invited email first gets the invite).
5. From then on, invite and remove members and change roles under "Spaces & members" on the home page. No command line needed.

### Going live (Cloudflare)

The frontend is a static site hosted on Cloudflare Workers (static assets); the backend stays on Convex. The config is `wrangler.jsonc` at the repo root.

1. In the Convex dashboard, create a Deploy Key for the production deployment.
2. Cloudflare dashboard → Workers & Pages → Create → import this GitHub repo (Workers Builds):
   - Build command: `npx convex deploy --cmd 'npm run build'`
   - Deploy command: `npx wrangler deploy`
   - Build variable: `CONVEX_DEPLOY_KEY` (the key from step 1)
3. Repeat steps 2–3 above for production (`npx convex env set --prod …`, `npx convex run --prod admin:bootstrap …`), with `SITE_URL` set to the Cloudflare domain (`*.workers.dev` or a custom domain).

### API tokens for MCP (reserved for phase 4)

```bash
npx convex run apiTokens:issue '{"email":"you@example.com","name":"claude-mcp"}'   # shown in plain text only once
npx convex run apiTokens:revoke '{"tokenId":"…"}'
```

## Development

```bash
npm run dev          # frontend + backend
npm run typecheck
npm run lint
npm test             # Vitest + convex-test, no real deployment needed
```

### UI text and translations

UI text is written in Chinese in the code (Lingui `<Trans>` and `` t`…` ``). After adding or changing text:

```bash
npm run i18n:extract   # updates src/locales/*/messages.po
```

Then fill in the English in `src/locales/en/messages.po`. CI checks that the catalogs are up to date and that no English translation is missing.

## Backups

```bash
npx convex export --path backups/$(date +%F).zip   # full snapshot; backups/ is not committed
```
