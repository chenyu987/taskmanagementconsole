# 0003 中英双语：界面用 Lingui，文档双份

日期：2026-11-25 · 状态：已采纳 · [English](./0003-bilingual.en.md)

## 背景

LYC 希望 App 有中文和英文两种界面，GitHub 上的项目也有英文，方便以后的人看。

## 决定

- **界面**：用 Lingui（`@lingui/core` + `@lingui/react`，Vite 插件原生转换宏，不需要 Babel）。源语言是中文，写在代码里；英文在 `src/locales/en/messages.po`。
  - 选 Lingui 而不是 i18next：编译时宏，运行时体积小；文字直接写在组件里，不用另起 key；`lingui extract` 能自动找出新文字和漏翻。
  - 第一次打开跟随浏览器语言；切换后记在本机和账号上（`convex/prefs.ts`，存在 `viewPrefs` 的 `app` 行），登录后以账号为准。
  - 只翻译界面，不翻译用户写的内容（节点标题、空间名等）。后端只返回错误码，文字由前端按语言显示。
  - CI：`npm run i18n:check` 检查翻译文件已随代码更新；`tests/i18n.test.ts` 检查英文没有漏翻、占位符一致。
- **仓库文档**：README、DESIGN、决策记录各有中英两版（英文 README 是默认首页，决策记录英文版是 `*.en.md`），改一版时同一个 PR 里同步另一版。
  - CLAUDE.md 只保留中文一份（它是给 Claude 的工作规则，两份容易对不上），顶部加英文概要。
  - 代码注释暂时保持中文。

## 后果

- 每加一句界面文字都要补英文，否则 CI 不通过。
- 英文通常更长，排版要同时经得起两种语言（见 DESIGN.md）。
