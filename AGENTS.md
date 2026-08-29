# AGENTS.md — DiceFrame 移动客户端

给 AI 编码代理的仓库须知。人类向的完整文档见 [README.md](README.md)；两者冲突时以本文件为准。

## 先读版本化文档

Expo API 迭代很快，**写任何 Expo 相关代码前**，先查对应版本的文档：
https://docs.expo.dev/versions/v57.0.0/ （本项目锁 SDK 57，不要照抄教程里其他版本的 API）。

## 项目一句话

DiceFrame（AI 跑团引擎）的 React Native 客户端：连接 DiceFrame 服务端（REST + SSE），
聚焦游玩侧——语音输入、流式叙事、行动提交、检定卡、角色面板。服务端与 Web 端在
[diceframe/diceframe](https://github.com/diceframe/diceframe) 主仓库，**后端零改动**，本仓库只做客户端。

技术栈：Expo SDK 57（RN 0.86 / React 19.2 / New Architecture）、expo-router、
NativeWind v4 + React Native Reusables（rnr，基于 `@rn-primitives/*`）、zustand、
react-native-sse、React Compiler。

## 常用命令

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint（expo config + react-hooks 含 compiler 规则）
npm test            # vitest run
npm start           # expo start（Metro 固定 8081）
npm run start:tunnel# 经隧道暴露给外部设备时用，读取 .env.local 的 DICEFRAME_EXPO_PROXY_URL
npm run web         # Metro 内置 dev 反向代理转发 /api 与 /v2-assets 到本机后端，Web 登录页服务器地址留空即可
npm run ui:add      # 从 rnr registry 生成基础组件到 src/components/ui（不许手写该目录）
```

CI（`.github/workflows/ci.yml`）= typecheck + test + lint 三项全绿才算过。提交前至少跑 typecheck 和 lint。
APK 构建不要本地装 Android Studio：用 GitHub Actions 工作流 `Build Android APK`（README 有说明）。

## 架构与分层（依赖只允许自上而下）

```
src/
├── app/          # expo-router 路由，薄壳：index 分流、(auth) 登录/加入、(tabs) 一级 Tab
│                 # （overview 对局 / characters 角色 / lorebook 世界书 / profile 我的）、
│                 # (profile) 二级页（settings/worlds/memory/rules/plugins/peer/logs/legal）、
│                 # play/[gameKey] 对局页。路由逻辑尽量下沉到 features/hooks
├── features/     # 按领域的界面与业务组件（overview / play / characters / lorebook / worlds…）
├── hooks/        # 数据域 hooks（useCharacters、useWorlds…），内部走 api/ + stores/
├── api/          # client.ts（baseUrl/token/会话/Confirm 头）+ 各资源端点 + types.ts 契约
├── stream/       # gameStream.ts：SSE 通道（票据握手、可恢复游标、5s 重连、30s 轮询降级）
├── stores/       # zustand：settings（persist 到 AsyncStorage）、game（对局态）
├── lib/          # 纯逻辑工具（主题、分享链接解析、GM 文本解析、文案 strings.ts），单测集中地
└── components/   # ui/ = React Native Reusables（rnr）CLI 生成的 registry 产物；
                  # patterns/ = DiceFrame 自己的组合件（对 ui/ 的定制只放这里）
```

## 硬性规则

1. **不手写 `useMemo` / `useCallback` / `React.memo`**。React Compiler 已开启
   （`app.json` 的 `experiments.reactCompiler`），手动记忆化反而破坏其优化。
   `eslint.config.js` 里 `react-hooks/exhaustive-deps` 因此关闭，其余 compiler 规则保持开启。
2. **不要绕过 `src/api/client.ts` 自己发 fetch**。约定都封装在里面：
   - 非 GET 请求必须带 `X-TRPG-Confirm: true`（服务端 `_require_confirmed_request`）；
   - 移动端读不到 `Set-Cookie`，会话 token 由客户端生成持久化并手动带 Cookie 头
     （Web 端行为不同，勿照搬 Web 代码）；
   - 玩家身份从 settings store `configureApiClient` 注入，拼进 query；
   - 错误统一抛 `ApiError`（含 status/code/retryAfter）。
3. **`src/api/types.ts` 是主仓库 `frontend-v2/src/api/types.ts` 的 v1 子集副本**。
   后端字段变更时必须与主仓库两处同步，不要在本仓库"顺手"加 Web 端没有的契约。
4. 样式用 NativeWind `className`；颜色取主题令牌（`src/lib/theme.ts` 的 `THEME` /
   `src/global.css` 的 `--df-*`），**不要硬编码色值**。
5. **`src/components/ui` 是 rnr registry 的生成产物，不许手写或手改**：
   - 缺基础组件先用 `npm run ui:add -- <component>` 从 rnr 生成（配置异常用 `npm run ui:doctor` 检查）；
   - 保持上游 API 原样，不要在 `ui/` 文件里加 DiceFrame 变体或业务逻辑；
   - DiceFrame 的组合与定制放 `src/components/patterns` 或对应 feature 目录。
6. 通用/跨页面复用的文案进 `src/lib/strings.ts`（预留 i18n）；feature 专属的静态文案
   可以内联写在组件里。同一句文案出现两处以上时收敛进 strings.ts。
7. 路径别名 `@/*` → `./src/*`（tsconfig / vitest / metro 均已配置）。
8. 单测只测纯逻辑，文件命名 `*.test.ts`（vitest 只收 `src/**/*.test.ts`，不含 tsx）。
   解析器、状态推导、契约解析类改动必须带测试。
9. 注释与文案用中文，与现有代码保持一致。注释写"为什么"和契约约束，不写"这行在干嘛"。

## 平台与构建注意

- `android/` 是本地 `expo prebuild` 产物，**未纳入 git**，改原生配置要走 `app.json` +
  `plugins/`（config plugin），不要直接改 `android/` 里的文件。
- Android 已开 `usesCleartextTraffic`（局域网明文 HTTP 是核心场景）；iOS ATS 例外留待出包处理。
- `.env.local` 是个人环境（隧道地址等），已被 gitignore，不要把里面的值写死进代码。
- 后台/前台切换有专门生命周期处理（暂停 SSE、回前台刷新）；动 `stream/` 或 `stores/game.ts`
  时先读 `src/stream/gameStream.ts` 的现有机制，别重复造轮子。

## 类型契约红线

v1 明确不含：创建向导、AI 服务商设置、世界书/记忆/规则**编辑**（只读展示除外）、
角色卡库、P2P 直连、插件市场、swipes。涉及这些范围的需求先确认，别自行扩界。
