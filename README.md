# 人生操作系统

LYC 的个人 + 团队任务系统：一切都是节点，从人生愿景到最小的要点。架构、权限规则和关键决定见 [CLAUDE.md](./CLAUDE.md)，视觉规范见 [DESIGN.md](./DESIGN.md)。

## 第一次部署（需要你亲自操作）

1. **Convex**：`npm install && npx convex dev`，用你的账号登录，新建项目（会生成 dev 部署和 `.env.local`）。
2. **Google 登录**：在 Google Cloud Console 新建 OAuth 客户端（Web 应用），授权重定向 URI 填
   `https://<你的部署名>.convex.site/api/auth/callback/google`。
3. **设置后端变量**：
   ```bash
   npx convex env set SITE_URL http://localhost:5173
   npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   npx convex env set GOOGLE_CLIENT_ID <client id>
   npx convex env set GOOGLE_CLIENT_SECRET <client secret>
   ```
   并在 `.env.local` 里补上 `VITE_CONVEX_SITE_URL=https://<你的部署名>.convex.site`。
4. **初始化工作区**（只运行一次，重复运行不会重复创建）：
   ```bash
   npx convex run admin:bootstrap '{"ownerEmail":"你的 Google 邮箱","teamEmails":["cxuq 的 Google 邮箱"]}'
   ```
5. `npm run dev`，打开 http://localhost:5173 用 Google 登录。

### 上线（Vercel）

1. 在 Convex 控制台创建 production 部署的 Deploy Key。
2. Vercel 导入本仓库，Build Command 设为 `npx convex deploy --cmd 'npm run build'`，环境变量设 `CONVEX_DEPLOY_KEY`。
3. 对 production 部署重复上面第 2–4 步（`npx convex env set --prod …`、`npx convex run --prod admin:bootstrap …`），`SITE_URL` 用 Vercel 域名，Google OAuth 里加上 production 的回调地址。

## 备份

```bash
npx convex export --path backups/$(date +%F).zip   # 全量快照，backups/ 不进仓库
```
