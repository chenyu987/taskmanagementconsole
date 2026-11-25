# 人生操作系统

LYC 的个人 + 团队任务系统：一切都是节点，从人生愿景到最小的要点。架构、权限规则和关键决定见 [CLAUDE.md](./CLAUDE.md)，视觉规范见 [DESIGN.md](./DESIGN.md)。

## 第一次部署（需要你亲自操作）

1. **Convex**：`npm install && npx convex dev`，用你的账号登录，新建项目（会生成 dev 部署和 `.env.local`）。
2. **设置后端变量**：
   ```bash
   npx convex env set SITE_URL http://localhost:5173
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   ```
   并在 `.env.local` 里补上 `VITE_CONVEX_SITE_URL=https://<你的部署名>.convex.site`。
3. **初始化工作区并发出邀请**（只运行一次，重复运行不会重复创建）：
   ```bash
   npx convex run admin:bootstrap '{"ownerEmail":"你的邮箱","teamEmails":["团队成员的邮箱"]}'
   ```
4. `npm run dev`，打开 http://localhost:5173 ，点「收到邀请、第一次来？设置密码」，用被邀请的邮箱设置密码。
   不公开注册：没有邀请的邮箱会被拒绝。邀请发出后请尽快注册（没有发信验证，谁先注册谁拿到邀请）。

### 上线（Cloudflare）

前端是纯静态站点，托管在 Cloudflare Workers（静态资源）；后端仍是 Convex。配置在根目录 `wrangler.jsonc`。

1. 在 Convex 控制台创建 production 部署的 Deploy Key。
2. Cloudflare 控制台 → Workers & Pages → 创建 → 导入本 GitHub 仓库（Workers Builds）：
   - Build command：`npx convex deploy --cmd 'npm run build'`
   - Deploy command：`npx wrangler deploy`
   - 构建变量：`CONVEX_DEPLOY_KEY`（第 1 步的 key）
3. 对 production 部署重复上面第 2–3 步（`npx convex env set --prod …`、`npx convex run --prod admin:bootstrap …`），`SITE_URL` 用 Cloudflare 上的域名（`*.workers.dev` 或自定义域名）。

### MCP 用的 API token（阶段 4 预留）

```bash
npx convex run apiTokens:issue '{"email":"你的邮箱","name":"claude-mcp"}'   # 明文只显示一次
npx convex run apiTokens:revoke '{"tokenId":"…"}'
```

## 备份

```bash
npx convex export --path backups/$(date +%F).zip   # 全量快照，backups/ 不进仓库
```
