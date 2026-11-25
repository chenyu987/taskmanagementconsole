# CLAUDE.md

本文件记录这个项目的理念、架构、权限规则和关键决定。**每次重大改动都要同步更新本文件。**

## 理念

这是 LYC 长期自用和维护的「人生操作系统」：既是 EverHarvest（北美雪票业务）的团队任务系统，也承载 LYC 的人生哲学和私人事务。

- **一切都是节点**，层级不设上限：人生状态 / 愿景 → 领域 → 项目 → 任务 → 子任务 → 要点 → 子要点……
- **类型只是标签**：vision / area / project / task / bullet / note 等可以随时修改，要点可以直接升级成任务。
- 随时可以在任何节点上方插入新的父节点。
- 每个节点有一个主父节点，另外可以用「同时服务于」（serves）连线关联到别的节点；依赖用 depends_on 连线。
- 进度自动向上汇总。默认首页是「今天要做什么」，整棵树是地图视图。
- **LYC 看全部、cxuq 只看公司**（LYC 的硬性需求）：LYC 打开今日视图、任务列表、看板时，私人和 EverHarvest 的任务**合在一个视图里**，和他现在 Notion 里 Tasks 数据库的样子一样（一张表，每行标出属于哪个空间，可按空间筛选），不需要来回切换空间。cxuq 登录时只看到 LYC 允许他看的公司（EverHarvest）任务。由 LYC 决定每个人能看哪些空间（实现方式就是工作区成员资格，见「权限规则」；阶段 1 做成员管理界面，在那之前用命令行）。
- 做这个项目的核心原因是图（diagram）要能好好定制。
- 技术选择以长期最优为准，有更好的方案主动提出来。

## 架构

| 层 | 选型 |
| --- | --- |
| 后端 | Convex（数据库、函数、实时同步、全文搜索、向量搜索） |
| 登录 | Better Auth，经 `@convex-dev/better-auth` 组件；邮箱 + 密码，不公开注册（仅限邀请），会话 90 天滚动续期；Google / GitHub 以后再加 |
| 前端 | React + TypeScript + Vite，Tailwind v4，shadcn/ui 只当底层组件（按 DESIGN.md 重做主题） |
| 编辑器 | 大纲是自研组件（每行一个节点）；长笔记用 BlockNote + `@convex-dev/prosemirror-sync`（阶段 1） |
| 图 | React Flow + elkjs（阶段 2）；甘特图用 visx 自绘（阶段 3） |
| AI | Convex HTTP action 实现的 MCP 服务器（阶段 4），用 API token 认证（`apiTokens` 表，已预留） |
| 部署 | 前端静态站点放 Cloudflare Workers（`wrangler.jsonc`），后端 Convex 云 |

目录：

```text
convex/
  schema.ts            数据模型（nodes / nodeLinks / workspaces / memberships / …）
  auth.ts, auth.config.ts, http.ts   Better Auth 接入（邮箱 + 密码、注册门禁、会话时长）
  invites.ts           注册门禁：邮箱有没有未认领的邀请
  apiTokens.ts         internal：签发 / 吊销 API token（为 MCP 预留）
  lib/apiTokens.ts     token 生成与 SHA-256 哈希
  lib/email.ts         邮箱规范化
  lib/access.ts        公共权限检查（唯一入口）
  lib/functions.ts     authedQuery / authedMutation（唯一可以导入裸 query/mutation 的文件）
  lib/status.ts        startedAt / completedAt 规则
  lib/tree.ts          树位置、子树范围、挂载规则
  admin.ts             internal：初始化工作区（命令行运行）
  memberships.ts       认领邀请
  nodes.ts, viewer.ts  读接口
tests/                 Vitest + convex-test；fixtures.ts 造 lyc / cxuq 两个身份
src/                   前端（features/ 按功能分目录）
docs/decisions/        ADR
```

数据模型要点：

- `nodes.ancestorIds` 是从根到父的祖先链；`nodes.path` 是 `"根id/…/自己id/"` 字符串，用 `by_workspace_path` 索引做子树前缀范围查询（Convex 索引不支持数组包含查询）。
- 图上坐标存在 `nodeLayouts`（每张图一份），不在 nodes 上。
- 删除是软删除（`deletedAt`），回收站里的节点对所有读接口视为不存在。
- `rollup` 是进度汇总缓存，由服务端在状态变化时沿祖先链更新。
- `startedAt` / `completedAt` 只能由 `lib/status.ts` 的 `applyStatusChange` 写：变成 in_progress 写 startedAt（保留首次值），变成 done 写 completedAt，离开 done 清空 completedAt。

## 权限规则（硬性，最重要）

1. 每个节点属于且只属于一个工作区。能否读写一个节点，**只看当前用户是不是该工作区的成员**。
2. 所有公开的 query / mutation 必须用 `convex/lib/functions.ts` 的 `authedQuery` / `authedMutation` 编写；单节点读写必须先调用 `assertNode`。ESLint 和 `tests/wrapperGuard.test.ts` 会拦截直接导入裸 `query` / `mutation` / `action` / `httpAction`。
3. 不存在和无权访问一律返回 `NOT_FOUND`，不能让人用 id 试探私人节点是否存在。
4. 返回给前端的节点必须经过 `redactNode`：裁掉读者看不到的祖先（parentId、ancestorIds、path、depth 都要裁）。
5. 连线两端都可读才可见、都可写才可改。笔记、评论、变更记录跟随所属节点。
6. **挂载规则**：只有工作区根节点可以挂在别的工作区的节点下，而且父空间成员必须是子空间成员的子集（私人 ⊆ EverHarvest 可以；反过来不行）。这样任何人能看到的节点，其子孙和进度汇总里都不会混入他看不到的东西。
7. 列表类查询在服务端按工作区 + 索引取数，不能取全表再在前端过滤。跨空间的合并视图（LYC 的「全部任务」）= 对 `viewer.workspaceIds` 里的每个空间分别按索引取数再合并，不是取全表；cxuq 调同一个接口，天然只拿到 EverHarvest。
8. 非常规入口（prosemirror-sync 的 checkRead / checkWrite、搜索结果、MCP 的 HTTP action）也必须走 `lib/access.ts`。
9. **以后每新增一个读类入口，都必须在 `tests/personalIsolation.test.ts` 里加上 cxuq 读不到私人内容的用例**（用 `expectNoPrivateData` 检查哨兵字符串和私人 id）。这些测试失败的 PR 不能合并。

成员与登录：

- 登录方式是邮箱 + 密码（Better Auth）。**不公开注册**：只有 `memberships` 里有未认领邀请的邮箱才能建账号（`convex/auth.ts` 的 `databaseHooks.user.create.before` → `invites.hasPendingInvite`），以后加 Google / GitHub 也走同一道门禁。只有 LYC 能发邀请（目前用 `admin.ts` 的 internal 函数在命令行操作）。
- 门禁放行的邮箱注册时直接标记为已验证（邀请即验证），之后前端调用 `memberships.claimInvites` 按邮箱绑定成员资格。已知风险：没有发信验证，谁先用被邀请的邮箱注册谁就拿到邀请——发出邀请后让对方尽快注册；以后接入发信服务再加邮箱验证。
- 登录成功不代表有权限，权限只看 `memberships`。
- 会话 90 天有效，每天使用会自动续期（`session.expiresIn` / `updateAge`），手机 PWA 上基本不用重新登录。
- **API token（MCP 预留）**：`npx convex run apiTokens:issue '{"email":"…","name":"…"}'` 签发，明文只显示一次，库里只存 SHA-256。HTTP action 里用 `lib/access.ts` 的 `getViewerFromApiToken` 解析成与网页登录相同的 `Viewer`，之后照常走 `assertNode` / `assertWorkspace`，token 的权限与本人完全相同。

## 设计规则（硬性）

- **所有前端改动必须遵守 [DESIGN.md](./DESIGN.md)。**
- 每次前端改动的 PR 都要附截图（浅色 + 深色）。
- 只能用 `src/index.css` 里 `@theme` 定义的 design tokens，不写死颜色、间距、圆角、阴影。

## 开发

```bash
npm install
npx convex dev          # 首次运行会让你登录 Convex 并创建 dev 部署，同时重新生成 convex/_generated
npm run dev             # 前端 + 后端
npm run typecheck       # tsc -b && tsc -p convex
npm run lint
npm test                # vitest + convex-test，不需要真实部署
```

- `convex/_generated/` 要提交进仓库（CI 的类型检查需要它）。阶段 0 的版本是按 Convex 代码生成规则手工复现的；第一次运行 `npx convex dev` 后会被自动覆盖，覆盖后的差异直接提交即可。
- 测试文件放在根目录 `tests/`，不要放进 `convex/`（`convex/` 下的文件都会被部署）。

### Convex MCP 服务器

查数据、看表结构、看日志、调试函数都通过 Convex 的 MCP 服务器来做，不要另写临时脚本。

- 仓库根目录的 `.mcp.json` 已配置好（Claude Code 打开本仓库时会提示启用）：

  ```json
  { "mcpServers": { "convex": { "command": "npx", "args": ["convex", "mcp", "start", "--project-dir", "."] } } }
  ```

- 前提：本机已 `npm install`，并运行过一次 `npx convex dev`（会在 `.env.local` 写入 `CONVEX_DEPLOYMENT`）。MCP 默认连这个 dev 部署。
- 生产部署默认不可访问。除非 LYC 明确要求，不要加 `--prod`、`--cautiously-allow-production-pii` 或 `--dangerously-enable-production-deployments`。
- 常用工具：`status`（当前部署）、`tables`（表结构）、`data`（分页读表）、`runOneoffQuery`（只读临时查询）、`functionSpec`（函数签名）、`run`（调用函数）、`logs`（日志）。
- 其他 MCP 客户端（如 Claude Desktop、Cursor）用同样的 command 和 args 配置即可。

## 工作流程

- 分阶段交付，每个阶段 LYC 验收后才进入下一阶段。计划文档：https://claude.ai/artifact/7jp1Tg8Gxt1GqqbCWaWtYP
- 每个改动走分支 + PR，CI（typecheck、lint、test）全绿才合并。
- 数据从第一天起可以完整导出 JSON（阶段 1 起提供导出按钮）。

## 关键决定

| 日期 | 决定 | 理由 |
| --- | --- | --- |
| 2026-11-25 | 统一节点树，层级不写死 | 人生愿景到最小要点用同一套结构，类型可随时改 |
| 2026-11-25 | 登录用 Better Auth（`@convex-dev/better-auth`）而非 Clerk，不再考虑回退 Clerk | LYC 和 cxuq 平时都用 VPN，Clerk 的风控会拦截 VPN 登录；cxuq 在中国，不能依赖第三方登录服务。另外用户数据留在自己的 Convex，不绑定 SaaS |
| 2026-11-25 | 第一版只开邮箱 + 密码；Google / GitHub 以后作为可选再加 | 同上：不依赖第三方登录服务，国内和 VPN 下都能用 |
| 2026-11-25 | 不公开注册，只有 LYC 能邀请；会话 90 天滚动续期 | 这是自用 + 小团队系统；手机 PWA 上不想频繁重新登录 |
| 2026-11-25 | 为 MCP 预留 API token 认证（`apiTokens` 表，只存哈希） | 阶段 4 的 MCP 客户端不走浏览器会话；token 解析成同一个 Viewer，权限规则只有一套 |
| 2026-11-25 | 权限按工作区沿树继承 + 挂载规则 | 见「权限规则」 |
| 2026-11-25 | 增加 `path` 字段、`nodeLayouts` 表、软删除、`rollup` 缓存 | 子树查询需要可索引的路径；三张图坐标各自独立；删除可恢复；汇总读取不遍历整棵树 |
| 2026-11-25 | 大纲自研、长笔记用 BlockNote | 每个要点都是真正的节点，才能升级成任务、连线、按节点判权限 |
| 2026-11-25 | 甘特图用 visx 自绘 | 与 React Flow 共用设计 token，完全可定制 |
| 2026-11-25 | 任务视图默认跨空间合并（像 Notion Tasks），按成员资格自动过滤 | LYC 要在一个地方看私人 + 工作的全部任务；cxuq 只看 LYC 允许的公司任务。只有一套权限规则，不为合并视图另开口子 |
| 2026-11-25 | 前端部署用 Cloudflare，不用 Vercel | LYC 决定。前端是纯静态 SPA，用 Workers 静态资源托管即可；后端不动，仍在 Convex |

更详细的理由见 `docs/decisions/`。

## TODO / 待试验

新的待办和想试的东西都记在这里。

### 设计工具对比实验（待 LYC 接上 Figma MCP 和 v0 后执行）

- 状态：待办。前提未满足前，所有视图先用方案 1。
- 目标：找到最能做出高级感的设计工作流。
- 时机：设计系统（DESIGN.md）定下来之后。
- 方法：同一个「今日视图」，按 DESIGN.md 分别出三版：
  1. Cowork / Claude Code 按 DESIGN.md 直接实现
  2. Figma Make 生成设计，再通过 Figma MCP 读取设计稿转成代码
  3. Vercel v0 生成（React + shadcn + Tailwind，与本项目技术栈一致，代码可直接复用）
- 三版截图并排对比，由 LYC 挑方向；把胜出的设计语言反写进 DESIGN.md，再统一推广到全站。
- 前提：LYC 先接好 Figma MCP 和 v0。
