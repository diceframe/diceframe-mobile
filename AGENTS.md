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
react-native-sse、react-i18next、React Compiler。

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
对外发布默认本地构建正式签名 APK，校验版本、签名与 SHA-256 后上传 GitHub Release；GitHub Actions `Build Android APK` 仅作备用，避免云端构建耗时。方式见下文「平台与构建注意」和 README。

## 架构与分层（依赖只允许自上而下）

```
src/
├── app/          # expo-router 路由，薄壳：index 分流、(auth) 登录/加入、(tabs) 一级 Tab
│                 # （overview 对局 / characters 角色 / lorebook 世界书 / profile 我的）、
│                 # (profile) 二级页（settings/ 子路由含服务器/身份/外观等、worlds/memory/rules/plugins/peer/logs/legal）、
│                 # play/[gameKey] 对局页。路由逻辑尽量下沉到 features/hooks
├── features/     # 按领域的界面与业务组件（play / characters / lorebook / worlds / create / join / settings…）
├── hooks/        # 数据域 hooks（useCharacters、useWorlds…），内部走 api/ + stores/
├── i18n/         # react-i18next：index 初始化、keyset（key 全量类型）、useT/getT、
│                 # messages/web = 上游镜像段，messages/mobile = df 前缀功能簇
├── api/          # client.ts（baseUrl/token/会话/Confirm 头）+ 各资源端点 + types.ts 契约
├── stream/       # gameStream.ts：SSE 通道（票据握手、可恢复游标、5s 重连、30s 轮询降级）
├── stores/       # zustand：settings（persist 到 AsyncStorage，含 themeMode/language）、game（对局态）
├── lib/          # 纯逻辑工具（主题、locale 解析、分享链接解析、GM 文本解析），单测集中地
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
   - 错误统一抛 `ApiError`（含 status/code/retryAfter）；
   - 查询参数用 `api(path, { query: { keyword, limit, offset } })`（`apiBlob` 同样支持），
     不手拼 `?` / `&` 或预先编码 query 值；client 省略 null/undefined，保留 0/false/空字符串并统一注入身份。
     路径段仍须 `encodeURIComponent`，分页上限等业务校验保留在资源接口中。
3. **`src/api/types.ts` 是主仓库 `frontend-v2/src/api/types.ts` 的全量镜像 + 文末「移动端扩展段」**。
   同步方式 = 整文件重拷上游版本后还原文末扩展段；镜像段的字段不要手改。
   移动端新增契约一律写进扩展段（与上游同名接口用 declaration merging 合并，同名成员类型必须一致）。
   后端字段变更时先核对 Web 端 types.ts，再决定改镜像还是扩展。
4. 样式用 NativeWind `className`；颜色取主题令牌（`src/lib/theme.ts` 的 `THEME` /
   `src/global.css` 的 `--df-*`），**不要硬编码色值**。
5. **`src/components/ui` 是 rnr registry 的生成产物，不许手写或手改**：
   - 缺基础组件先用 `npm run ui:add -- <component>` 从 rnr 生成（配置异常用 `npm run ui:doctor` 检查）；
   - 保持上游 API 原样，不要在 `ui/` 文件里加 DiceFrame 变体或业务逻辑；
   - DiceFrame 的组合与定制放 `src/components/patterns` 或对应 feature 目录。
6. **所有面向用户的文案走 i18n**（react-i18next，zh-CN / en / ja 三语，`src/i18n/`）：
   - 上游镜像段 `src/i18n/messages/web/`：与主仓库 `frontend-v2/src/i18n/messages/` 同步，
     机械差异仅两处：插值 `{x}` 已转 i18next 的 `{{x}}`；上游嵌套对象 apiErrors 已拍平为
     `'apiErrors.xxx'` 扁平 key（移动端 `keySeparator: false` 取不到嵌套 key）；
   - 移动端自有文案按功能簇放 `src/i18n/messages/mobile/*.ts`（zh/en/ja 三块并列）：
     key 必须加 `df` 前缀、三语 key 集合必须一致、不得与上游 key 重名（`messages.test.ts` 兜底）；
   - 上游已有且语义一致的词直接复用上游 key（cancel/delete/roomPassword 等），不要重复建 df key；
   - 组件内 `useT()`、组件外 `getT()`（均在 `@/i18n/t`），插值 `t('key', { name })`；
     key 类型由 `src/i18n/keyset.ts` 全量校验，拼错/漏译 typecheck 直接报错；
   - 内容语言（世界模板/规则库等请求的 language 参数）用 `contentLanguage()` 跟随界面语言；
   - settings store 的 `language` 偏好（'system' | 具体语言）经 `useLocaleSync` 驱动切换。
7. 路径别名 `@/*` → `./src/*`（tsconfig / vitest / metro 均已配置）。
8. 单测只测纯逻辑，文件命名 `*.test.ts`（vitest 只收 `src/**/*.test.ts`，不含 tsx）。
   解析器、状态推导、契约解析类改动必须带测试。
9. 注释与文案用中文，与现有代码保持一致。注释写"为什么"和契约约束，不写"这行在干嘛"。

## 平台与构建注意

- `android/` 是本地 `expo prebuild` 产物，**未纳入 git**，改原生配置要走 `app.json` +
  `plugins/`（config plugin），不要直接改 `android/` 里的文件。
- 实机调试可本地出正式包：`JAVA_HOME` 指 JDK 17、`ANDROID_HOME` 指 Android SDK 后
  `android/gradlew assembleRelease`（新增含原生代码的依赖后先
  `npx expo prebuild -p android --clean --no-install`），产物在
  `android/app/build/outputs/apk/release/`，`adb install -r` 安装；
  对外发布同样使用本地正式签名构建；发布前校验三个 APK 的原生版本、递增构建号和签名与旧版一致，生成 SHA-256 文件后一并上传 GitHub Release。GitHub Actions `Build Android APK` 仅作备用。
- GitHub CLI 未登录时可复用 Git Credential Manager 的 GitHub 凭据，仅在子进程环境注入 `GH_TOKEN`，不得打印或写入文件；不要因此停止已获授权的发布。
- 发布说明写入 GitHub Release 正文；发布成功后删除临时发布说明 md，不在仓库长期保留。
- 移动端调用的 `/adventures`、`/worlds/clone-from-template`、`/worlds/{id}/gm-style`
  是预设端点（服务端尚未实现），调用处已做优雅降级，服务端上线后自动生效。
- Android 已开 `usesCleartextTraffic`（局域网明文 HTTP 是核心场景）；iOS ATS 例外留待出包处理。
- `.env.local` 是个人环境（隧道地址等），已被 gitignore，不要把里面的值写死进代码。
- 后台/前台切换有专门生命周期处理（暂停 SSE、回前台刷新）；动 `stream/` 或 `stores/game.ts`
  时先读 `src/stream/gameStream.ts` 的现有机制，别重复造轮子。

## 配置版本边界

- 跟随上游仅支持共享服务商目录 `ai_providers` 与能力级 `*_provider_ref`，不读取旧能力级直填地址或密钥，不恢复旧配置兜底。
- ASR、OpenAI-compatible / GPT-SoVITS TTS 的可用性须确认引用在目录中存在且服务商地址非空；本地服务商允许空密钥。Edge TTS 与设备系统朗读无需服务商引用。
- 本地身份统一使用 `shares` + `activeShareGame`，不恢复单份 `share` 持久化或旧迁移函数；API client 的当前请求身份仍按现有会话契约注入。
- 清理其它兼容前先核对上游当前生产与投影契约，不把普通规则能力、合法联合类型或历史存档投影误当作废弃配置。

## 类型契约红线

创建向导、世界书/记忆/规则编辑、角色卡库、插件市场、swipes 均已落地（v1 红线已解除），
照常维护即可。仍不做：AI 服务商设置（部署侧管理员功能，移动端没有使用场景）、
P2P 直连（SSE 票据握手与会话注入都建立在中心服务端上，与「后端零改动」前提冲突）。
涉及这两项的需求先确认，别自行扩界。
