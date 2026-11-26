# CLAUDE.md (English)

**English** · [中文](./CLAUDE.md)

> This is the full English version of [CLAUDE.md](./CLAUDE.md). Both are kept in sync in the same PR. If they ever disagree, the Chinese file wins.

This file records the project's philosophy, architecture, permission rules and key decisions. **Update it with every major change.**

## Philosophy

This is LYC's long-term, self-maintained "Life OS": the task system for the EverHarvest team (a North American ski-ticket business), and also the home of LYC's life philosophy and private affairs.

- **Everything is a node**, with unlimited depth: life state / vision → area → project → task → subtask → bullet → sub-bullet…
- **Types are only labels**: vision / area / project / task / bullet / note can be changed at any time; a bullet can be promoted straight into a task.
- A new parent can be inserted above any node at any time.
- Each node has one primary parent, and can also link to other nodes with "also serves" (`serves`) links; dependencies use `depends_on` links.
- Progress rolls up automatically. The default home page is "what to do today"; the whole tree is the map view.
- **LYC sees everything, cxuq sees only the company** (LYC's hard requirement): when LYC opens the Today view, the task list or the board, private and EverHarvest tasks are **merged into one view**, just like his current Notion Tasks database (one table, each row tagged with its space, filterable by space), with no switching between spaces. When cxuq signs in, they only see the company (EverHarvest) tasks LYC allows. LYC decides who can see which spaces (implemented as workspace membership, see "Permission rules"; invite, remove and change roles on the "Spaces & members" page, `#/members`).
- The core reason for building this project is fully customizable diagrams.
- Technology choices go for the long-term best; propose better options proactively.

## Architecture

| Layer | Choice |
| --- | --- |
| Backend | Convex (database, functions, realtime sync, full-text search, vector search) |
| Sign-in | Better Auth via the `@convex-dev/better-auth` component; email + password, no public sign-up (invite-only), 90-day rolling sessions; Google / GitHub later |
| Frontend | React + TypeScript + Vite, Tailwind v4, shadcn/ui only as low-level building blocks (re-themed per DESIGN.md) |
| Editor | The outline is a custom component (one node per line); long notes use BlockNote + `@convex-dev/prosemirror-sync` (phase 1) |
| Diagrams | React Flow + elkjs (phase 2); gantt hand-drawn with visx (phase 3) |
| AI | MCP server implemented as Convex HTTP actions (phase 4), authenticated with API tokens (`apiTokens` table, reserved) |
| Deploy | Static frontend on Cloudflare Workers (`wrangler.jsonc`), backend on Convex cloud |
| i18n | Lingui (Chinese is the source language; English translations in `src/locales/en/messages.po`), see "Chinese and English" |

Layout:

```text
convex/
  schema.ts            data model (nodes / nodeLinks / workspaces / memberships / …)
  auth.ts, auth.config.ts, http.ts   Better Auth setup (email + password, sign-up gate, session length)
  invites.ts           sign-up gate: does the email have an unclaimed invite
  apiTokens.ts         internal: issue / revoke API tokens (reserved for MCP)
  lib/apiTokens.ts     token generation and SHA-256 hashing
  lib/email.ts         email normalization
  lib/access.ts        shared permission checks (the only entry point)
  lib/functions.ts     authedQuery / authedMutation (the only file allowed to import raw query/mutation)
  lib/status.ts        startedAt / completedAt rules
  lib/tree.ts          tree position, subtree ranges, mount rule
  lib/order.ts         sibling sort keys (fractional-indexing)
  lib/rollup.ts        progress rollup: recomputed up the ancestor chain, stops at the first unchanged level
  admin.ts             internal: bootstrap workspaces (run from the command line)
  memberships.ts       claim invites
  prefs.ts             each user's own UI preferences (language)
  members.ts           member management: list / invite / remove / change role (owners only; enforces the mount rule and "at least one owner")
  nodes.ts             node reads and writes: get / listChildren / outline (whole tree) / create / update / move / remove / restore
  tasks.ts             multi-view table: list (merged task rows across spaces, with project / dependencies / open dependency count) / people (assignable people) / projects
  links.ts             dependency links: addDependency / remove (both ends must be accessible; rejects self-links and direct cycles)
  viewer.ts            current user and their spaces
tests/                 Vitest + convex-test; fixtures.ts creates the lyc / cxuq identities
src/                   frontend (features/ per feature; lib/useHashRoute.ts is a minimal hash router, e.g. #/members, #/tasks; lib/i18n.ts switches language; features/tasks/ is the table and board, with model.ts holding the pure filter / sort / group functions)
  locales/{zh-CN,en}/messages.po   UI translation catalogs (generated by `npm run i18n:extract`)
docs/decisions/        ADRs
```

Data model notes:

- `nodes.ancestorIds` is the ancestor chain from root to parent; `nodes.path` is the string `"rootId/…/ownId/"`, used with the `by_workspace_path` index for subtree prefix-range queries (Convex indexes can't query "array contains").
- Diagram coordinates live in `nodeLayouts` (one set per diagram), not on nodes.
- Deletion is soft (`deletedAt`); nodes in the trash don't exist for any read API.
- `rollup` is a cached progress summary, updated by the server along the ancestor chain when a status changes.
- Outline editing rules (`convex/nodes.ts`):
  - Moving a subtree rewrites `ancestorIds` / `path` / `depth` for all of it (including descendants in the trash).
  - **Moves only within one workspace** (`CROSS_WORKSPACE`): a private node can't be put under EverHarvest, or cxuq would see it. A future "hand private content over to the team" feature will be its own explicit action; `move` will not be loosened.
  - A workspace root can't be moved or deleted (`ROOT_LOCKED`); mounting is handled separately later. A subtree with another workspace mounted under it can't be deleted (`CONTAINS_WORKSPACE`).
  - Delete = the whole subtree gets the same `deletedAt`; restore brings back that same batch by timestamp (the frontend offers "Undo" after deleting).
- Statuses are backlog / pending / in_progress / blocked / done / cancelled; nodes have `priority` (p0–p2), `estimatedHours`, `actualHours`.
- `startedAt` / `completedAt` are written only by `applyStatusChange` in `lib/status.ts`: becoming in_progress sets startedAt (keeping the first value), becoming done sets completedAt, leaving done clears completedAt.

## Multi-view table (LYC's requirement, 2026-11-25)

LYC currently manages projects with Notion's Tasks + Projects databases, and this system needs the same "multi-dimensional table". The scope below was set against his Notion (read-only):

- **One dataset, many views**: table, board and timeline are different views of the same nodes (`nodes`), not separate tables. View settings (visible columns, column widths, filters, sorts, grouping) are saved per user in `viewPrefs`, and there can be several named views.
- **Columns** (all node fields): title, status, assignee, space (replaces Notion's Area), priority P0/P1/P2, start, due, completed date, estimated hours, actual hours, project (nearest ancestor with type=project), depends on / blocking (`depends_on` links), open dependencies (0 = ready to start), notes.
- **Statuses**: Backlog / Pending / In Progress / Blocked / Done (plus cancelled). Date columns show "X days ago / today / in X days" within 5 days, otherwise the date.
- **Filters**: AND / OR, nested one level; **sorts**: multiple columns, including a custom status order (In Progress → Blocked → Pending → Done → Backlog); **grouping**: by any single-select column (assignee, status, space, priority, project); the board supports group + subgroup (e.g. columns per person, rows per status).
- **Notion views to reproduce**: default table (grouped by assignee), per-person board, timeline (start → due), AI to-do, done, dependencies, to-log-in-calendar.
- **Permissions unchanged**: the table is just another rendering of the merged view; data is still fetched per space the reader belongs to (permission rule 7). cxuq opening the same view gets only EverHarvest rows.
- **Phasing**: table + board + saved views are in phase 1 (with the Today view, this is the main daily task UI, and the phase 5 Notion import lands here); the timeline view ships with the gantt in phase 3.
- **Progress (2026-11-25)**: first version of table + board is in (`#/tasks`): five preset views (all tasks grouped by assignee, board by person, AI to-do, done, dependencies), space filter, inline cell editing, adding / removing dependencies, and dragging cards on the board to change assignee and status. Assigning to AI uses the fixed value `assigneeId = "ai"`; a task can only be assigned to joined members of its space (`INVALID_ASSIGNEE`). Not done yet: a custom filter / sort / group editor and named views saved in `viewPrefs` (for now only the last chosen view is remembered on the device), and column resizing.
- **Data model**: status `blocked` and node fields `priority`, `actualHours` are in (outline PR). "Logged (written to calendar)" comes with the calendar work in phase 6. Custom fields (adding a column on the fly like Notion) come later; first finish the built-in fields above.

## Permission rules (hard, most important)

1. Every node belongs to exactly one workspace. Whether a user can read or write a node depends **only on whether they are a member of that workspace**.
2. Every public query / mutation must be written with `authedQuery` / `authedMutation` from `convex/lib/functions.ts`; single-node reads and writes must call `assertNode` first. ESLint and `tests/wrapperGuard.test.ts` block direct imports of raw `query` / `mutation` / `action` / `httpAction`.
3. "Doesn't exist" and "no access" both return `NOT_FOUND`, so nobody can probe whether a private node exists by id.
4. Nodes returned to the frontend must go through `redactNode`: ancestors the reader can't see are trimmed (parentId, ancestorIds, path and depth all trimmed).
5. A link is visible only if both ends are readable, and editable only if both ends are writable. Notes, comments and change logs follow their node.
6. **Mount rule**: only a workspace root can sit under a node of another workspace, and the parent workspace's members must be a subset of the child workspace's members (private ⊆ EverHarvest is fine; the reverse is not). That way nothing below a node someone can see, nor its rollup, includes things they can't see.
7. List queries fetch per workspace with an index on the server; never fetch the whole table and filter on the frontend. The cross-space merged view (LYC's "all tasks") = fetch each space in `viewer.workspaceIds` separately by index and merge, not a full-table read; cxuq calling the same API naturally gets only EverHarvest.
8. Unusual entry points (prosemirror-sync's checkRead / checkWrite, search results, MCP HTTP actions) must also go through `lib/access.ts`.
9. **Every new read entry point must add a test to `tests/personalIsolation.test.ts` showing cxuq can't read private content** (use `expectNoPrivateData` to check the sentinel string and private ids). PRs failing these tests must not be merged.

Members and sign-in:

- Sign-in is email + password (Better Auth). **No public sign-up**: only emails with an unclaimed invite in `memberships` can create an account (`databaseHooks.user.create.before` in `convex/auth.ts` → `invites.hasPendingInvite`); Google / GitHub will go through the same gate later. Only a space owner (LYC) can invite, on the "Spaces & members" page (`convex/members.ts`). To invite someone into a parent space such as Private, they must already be in every space mounted under it (mount rule); every space keeps at least one joined owner.
- An email let through the gate is marked verified at sign-up (the invite is the verification); the frontend then calls `memberships.claimInvites` to bind memberships by email. Known risk: with no email verification, whoever registers an invited email first gets the invite, so ask invitees to register promptly; email verification comes once an email service is added.
- Signing in doesn't grant access; access depends only on `memberships`.
- Sessions last 90 days and renew with daily use (`session.expiresIn` / `updateAge`), so the phone PWA rarely needs a new sign-in.
- **API tokens (reserved for MCP)**: issue with `npx convex run apiTokens:issue '{"email":"…","name":"…"}'`; the plain text is shown once and only the SHA-256 is stored. In HTTP actions, `getViewerFromApiToken` in `lib/access.ts` resolves the same `Viewer` as a web sign-in, then `assertNode` / `assertWorkspace` apply as usual; a token has exactly its owner's permissions.

## Chinese and English (LYC's requirement, 2026-11-25)

- **App**: the UI is in Chinese and English, switched in the top-right corner; the first visit follows the browser language, after that the choice is saved on the account (`convex/prefs.ts`). Only the UI is translated, never user content.
- **All UI text must use Lingui** (`<Trans>` or `` t`…` ``, imported from `@lingui/react/macro` / `@lingui/core/macro`), never hard-coded in JSX. Chinese is the source language. After adding text, run `npm run i18n:extract` and fill in the English in `src/locales/en/messages.po`. CI's `i18n:check` and `tests/i18n.test.ts` block PRs with stale catalogs or missing translations.
- The backend only returns error codes (`ConvexError({ code })`); the frontend shows the human-readable text in the current language.
- **Bilingual repository docs**: README (`README.md` English, `README.zh-CN.md` Chinese), CLAUDE (`CLAUDE.md` / `CLAUDE.en.md`), DESIGN (`DESIGN.md` / `DESIGN.en.md`) and decision records (`*.md` / `*.en.md`) all have both versions. **When changing one, update the other in the same PR.** For CLAUDE, the Chinese file is authoritative if they ever disagree.
- Code comments stay in Chinese for now.

## Design rules (hard)

- **Every frontend change must follow [DESIGN.md](./DESIGN.md)** ([English](./DESIGN.en.md)).
- Every PR with a frontend change includes screenshots (light + dark).
- Only the design tokens defined in `@theme` in `src/index.css` may be used; no hard-coded colors, spacing, radii or shadows.

## Development

```bash
npm install
npx convex dev          # first run signs you in to Convex, creates the dev deployment and regenerates convex/_generated
npm run dev             # frontend + backend
npm run typecheck       # tsc -b && tsc -p convex
npm run lint
npm test                # vitest + convex-test, no real deployment needed
```

- `convex/_generated/` is committed (CI's typecheck needs it). The phase 0 version was reproduced by hand following Convex's codegen rules; the first `npx convex dev` overwrites it, and the resulting diff can be committed as is.
- Test files live in the root `tests/`, not in `convex/` (everything under `convex/` gets deployed).

### Convex MCP server

Use Convex's MCP server for querying data, inspecting the schema, reading logs and debugging functions; don't write throwaway scripts.

- `.mcp.json` at the repo root is already set up (Claude Code offers to enable it when opening this repo):

  ```json
  { "mcpServers": { "convex": { "command": "npx", "args": ["convex", "mcp", "start", "--project-dir", "."] } } }
  ```

- Prerequisites: `npm install` done locally, and `npx convex dev` run once (it writes `CONVEX_DEPLOYMENT` to `.env.local`). MCP connects to that dev deployment by default.
- Production is not accessible by default. Unless LYC explicitly asks, never add `--prod`, `--cautiously-allow-production-pii` or `--dangerously-enable-production-deployments`.
- Common tools: `status` (current deployment), `tables` (schema), `data` (paged table reads), `runOneoffQuery` (read-only ad-hoc query), `functionSpec` (function signatures), `run` (call a function), `logs` (logs).
- Other MCP clients (Claude Desktop, Cursor, …) use the same command and args.

## Workflow

- Delivered in phases; each phase starts only after LYC accepts the previous one. Plan doc: https://claude.ai/artifact/7jp1Tg8Gxt1GqqbCWaWtYP
- Every change goes through a branch + PR, and merges only when CI (typecheck, lint, test) is fully green.
- All data is exportable as JSON from day one (an export button from phase 1).

## Key decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-11-25 | One node tree, depth not hard-coded | Life vision down to the smallest bullet uses one structure; types can change at any time |
| 2026-11-25 | Sign-in with Better Auth (`@convex-dev/better-auth`), not Clerk; no fallback to Clerk | LYC and cxuq usually use a VPN, and Clerk's risk checks block VPN sign-ins; cxuq is in China and can't depend on third-party sign-in services. User data also stays in our own Convex, not tied to a SaaS |
| 2026-11-25 | First version is email + password only; Google / GitHub optional later | Same as above: no third-party sign-in dependency, works in China and over VPN |
| 2026-11-25 | No public sign-up, only LYC invites; 90-day rolling sessions | A personal + small-team system; no frequent re-sign-in on the phone PWA |
| 2026-11-25 | Reserve API token auth for MCP (`apiTokens` table, hashes only) | Phase 4 MCP clients don't use browser sessions; a token resolves to the same Viewer, so there's one set of permission rules |
| 2026-11-25 | Permissions inherited down the tree by workspace + mount rule | See "Permission rules" |
| 2026-11-25 | Add the `path` field, `nodeLayouts` table, soft delete, `rollup` cache | Subtree queries need an indexable path; three diagrams keep separate coordinates; deletes are recoverable; reading rollups doesn't walk the whole tree |
| 2026-11-25 | Custom outline, BlockNote for long notes | Every bullet is a real node, so it can become a task, be linked, and have node-level permissions |
| 2026-11-25 | Gantt hand-drawn with visx | Shares design tokens with React Flow, fully customizable |
| 2026-11-25 | Task views merge spaces by default (like Notion Tasks), filtered by membership | LYC wants private + work tasks in one place; cxuq sees only the company tasks LYC allows. One set of permission rules, no special path for the merged view |
| 2026-11-25 | Add multi-view table (table / board / timeline + saved views), matching LYC's Notion Tasks | That's how LYC manages projects today; same node data in different views, no separate tables, permission rules unchanged |
| 2026-11-25 | Bilingual UI (Lingui) and bilingual repo docs, including a full English CLAUDE.en.md | LYC wants future readers to have English too; see `docs/decisions/0003-bilingual.en.md` |
| 2026-11-25 | Deploy the frontend on Cloudflare, not Vercel | LYC's decision. The frontend is a pure static SPA served by Workers static assets; the backend stays on Convex |

More detailed reasoning is in `docs/decisions/`.

## TODO / to try

New to-dos and things to try go here.

### Vision picture: the concrete result of reaching a goal + AI image (LYC 2026-11-25)

- Status: to do, after the main screens (outline, Today view, table) are usable.
- Idea: add a "vision" tag / field to a node describing the concrete result you'll see once it's done. Example: "Get good at golf" → "Play a round at that course on 17 Mile Drive (Pebble Beach) I used to love". The more concrete the goal, the more motivation.
- AI can generate an image from that description, used as the background / cover of the node (and the tasks under it), visible when zooming into it in the outline, on project pages and in the Today view.
- Open questions:
  - Relationship to the existing `type = vision`. Leaning towards a "vision picture" field any node can have, regardless of type.
  - Which image model, and where images are stored (Convex file storage).
  - Images and descriptions on private nodes are visible only to their owner, under the same permission rules, with cases added to `personalIsolation`.
  - How to place a background image without hurting readability (DESIGN.md: content first).

### Design tool comparison (after LYC connects Figma MCP and v0)

- Status: to do. Until the prerequisites are met, every view uses approach 1.
- Goal: find the design workflow that produces the most premium feel.
- When: after the design system (DESIGN.md) is settled.
- Method: the same "Today view", built three ways per DESIGN.md:
  1. Cowork / Claude Code implementing DESIGN.md directly
  2. Figma Make generates the design, then the Figma MCP reads it and turns it into code
  3. Vercel v0 generates it (React + shadcn + Tailwind, the same stack as this project, so the code is reusable)
- Screenshots side by side; LYC picks the direction; the winning design language is written back into DESIGN.md and rolled out across the app.
- Prerequisite: LYC connects Figma MCP and v0 first.
