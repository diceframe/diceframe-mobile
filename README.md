# DiceFrame 移动客户端

DiceFrame（AI 跑团引擎）的 React Native 客户端。**v1 聚焦核心游玩体验**：
语音输入（原生录音，不受浏览器安全上下文限制——这是本客户端立项的直接原因）、
实时流式叙事（SSE）、行动提交、检定/运气卡、角色面板、基础 GM 操作。

## 演示视频

https://github.com/user-attachments/assets/a2fc3bb7-375c-4fcc-aac1-b0cf2a89b886

30 秒 · 1080p · 无声，展示行动提交、流式叙事、检定卡与角色面板。
画面复用客户端真实组件，在 Expo Web 中使用示例对局数据录制。

## 技术栈

| 项 | 选择 |
|---|---|
| 框架 | Expo SDK 57（React Native 0.86 / React 19.2 / New Architecture） |
| 路由 | expo-router（文件式；一级 Tab + 二级对局页） |
| 主题 | 与 Web 端统一：令牌移植（暗=midnight / 亮=light，跟随系统），鎏金 + 青蓝 |
| 多语言 | react-i18next + expo-localization（zh-CN / en / ja，默认跟随系统；文案资源同步自主仓库） |
| 性能 | React Compiler（`experiments.reactCompiler`；**全库不手写 `useMemo`/`useCallback`/`React.memo`**） |
| UI | NativeWind v4（≥4.2.6）+ 手写 shadcn 风格组件（`src/components/ui`） |
| 状态 | zustand（`settings` 持久化 + `game` 对局态） |
| 实时 | react-native-sse（票据握手 + 可恢复游标 + 5s 重连 + 30s 轮询降级） |
| 语音 | expo-audio（录音 m4a/AAC → `/transcription` 转写；服务端 TTS 播放） |
| 检查 | Vitest（纯逻辑单测）、eslint-plugin-react-hooks（含 compiler 规则） |

页面结构：一级 Tab = 对局列表 + 我的（换服务器/身份/朗读语速）；二级 = 对局内（`play/[gameKey]`）；
login/join 为全屏流程页。

移动端生命周期行为：切到后台会暂停 SSE 与轮询，回到前台立即刷新并重连；返回对局列表时自动刷新。
行动提交失败会保留草稿，避免局域网波动时丢失输入。

本次本地数据格式升级到 v3，**不兼容旧版数据**：首次启动会清空已保存的服务器、密码、
会话、玩家身份和设备偏好，需要重新登录或通过分享链接加入。服务端存档不受影响；
重新设置后正常保存，后续启动不会重复清空。

## 开发调试（局域网跑团场景）

前置：Node ≥ 20；PC 上运行 DiceFrame 服务端（`python web_server.py`，默认端口 18000）。

```bash
git clone https://github.com/diceframe/diceframe-mobile.git
cd diceframe-mobile
npm install
npx expo start        # 手机装 Expo Go 扫码，或 Android 调试构建
```

如果使用内网穿透把 Expo 暴露给外部设备，隧道应配置为：本地 `127.0.0.1:8081`，远程端口例如
`32218`。本机 Metro 仍然固定监听 `8081`，不要把本地端口改成 `32218`。

把隧道公网地址写进本机专用的 `.env.local`：

```env
DICEFRAME_EXPO_PROXY_URL=http://YOUR_TUNNEL_HOST:32218
```

之后直接运行：

```powershell
npm run start:tunnel
```

这个命令会自动把本机配置转换为 Expo 的对外地址，只覆盖二维码/开发服务器地址，不改变本机
Metro 的 `8081` 端口。`.env.local` 已被 Git 忽略，不会提交个人隧道地址。

1. App 内"服务器地址"填 PC 的局域网地址（如 `192.168.1.5:18000`）
2. Owner 输入访问密码登录；玩家从 Web 端复制分享链接，在 App「通过分享链接加入」粘贴
3. 语音输入需服务端在共享服务商目录中配置 ASR，并通过 `asr_provider_ref` 绑定有效服务商，否则麦克风按钮自动隐藏。服务器朗读的 OpenAI-compatible / GPT-SoVITS 引擎同样要求 `tts_provider_ref`；Edge TTS 和设备系统朗读无需引用。本地服务商可不填密钥，旧直填地址配置不再支持。

说明：
- `app.json` 已开启 `usesCleartextTraffic`，Android 允许局域网明文 HTTP
- Expo Go 内可直接测试录音/播放；独立 APK 构建用 `npx expo run:android` 或 EAS
- iOS：代码已预留（ATS 例外在出包时启用），需 Mac 或 EAS 云构建验证

### Web 端联调（`npm run web`）

Expo Web 页面与后端不同源，浏览器会按 CORS 拦截 API/SSE 请求。`metro.config.js`
内置了 dev 反向代理（`scripts/dev-api-proxy.cjs`）：Metro 收到的 `/api` 与
`/v2-assets` 会被转发到本机后端（默认 `http://127.0.0.1:18000`），因此 Web 端
登录页**服务器地址留空即可**，所有请求走同源，无跨域。

- 后端不在本机时指定目标：`DICEFRAME_API_TARGET=http://192.168.1.5:18000 npm run web`
- 会话 Cookie 在 Web 上由服务端 httponly `Set-Cookie` + 浏览器 cookie jar 自动管理
  （原生端才是客户端自管 token + 手动 Cookie 头）
- 代理仅存在于 Metro dev server：`expo export` 静态包与原生构建不受影响；静态包
  若部署在后端同一域下，登录页同样留空直连，部署在其他域则填地址并配合后端
  `TRPG_WEB_CORS_ORIGINS` 白名单

## 与 DiceFrame 主仓库的关系

- 服务端与 Web 端位于 [diceframe/diceframe](https://github.com/diceframe/diceframe)
- 后端零改动，移动端通过 REST + SSE 契约连接 DiceFrame 服务端
- **类型契约**：`src/api/types.ts` 是主仓库 `frontend-v2/src/api/types.ts` 的 v1 子集副本，
  后端字段变更时两处同步
- v1 不含：创建向导、AI 服务商设置、世界书/记忆/规则编辑、角色卡库、P2P 直连、
  插件市场、swipes、地图节点图——这些继续用 Web 端

## 常用命令

```bash
npm test          # Vitest 单测（API client / SSE 解析 / GM 文本解析 / 分享链接解析）
npm run typecheck # tsc --noEmit
npm run lint      # eslint（react-hooks + compiler 规则）
npx expo export --platform android --output-dir dist  # 本地整包冒烟
```

### 本地构建与发布 APK

默认在本机构建正式签名 APK 并上传 GitHub Release，减少云端构建等待。首次配置使用
`scripts/configure-android-signing.ps1`，必须沿用已发布 APK 的签名密钥。
设置 `JAVA_HOME` 为 JDK 17、`ANDROID_HOME` 为 Android SDK 后运行：

```bash
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon
```

产物在 `android/app/build/outputs/apk/release/`。将 `app-arm64-v8a-release.apk`、
`app-armeabi-v7a-release.apk`、`app-universal-release.apk` 分别命名为下文三个发布包名，
核对包名、原生版本、构建号及签名与旧版一致，再生成 SHA-256 文件，与 APK 一并上传
GitHub Release。先上传齐全附件，再公开 Release 并设为 latest。发布说明直接保存在
Release 正文中，发布成功后删除临时说明 md。

GitHub CLI 未登录时，可从 Git Credential Manager 复用 GitHub 凭据，仅在子进程环境
注入 `GH_TOKEN`，不得打印或落盘。

### GitHub Actions 备用构建

本地环境不可用时，可手动触发 GitHub Actions 工作流 `Build Android APK`。在 GitHub 仓库的
**Actions** 页面选择该工作流，点击 **Run workflow**；构建完成后，从运行页面底部的
Artifacts 下载 `diceframe-android-apk`。压缩包内包含三个可直接安装的 APK 及各自的
SHA-256 校验文件：

- `DiceFrame-android-arm64-v8a.apk`：armv8 瘦身包（2016 年后的主流机型）；
- `DiceFrame-android-armeabi-v7a.apk`：armv7 瘦身包（较旧机型）；
- `DiceFrame-android.apk`：universal 全量包（体积最大，作为兜底/通用下载项）。

拆分配置由 `plugins/withAbiSplits.js` 在 prebuild 时注入。Artifact 保留 14 天。
工作流使用固定的正式签名，需先在仓库 Actions secrets 中配置以下四项；必须沿用
已发布 APK 的签名密钥，不能为每次构建重新生成，否则 Android 无法覆盖安装：

- `DICEFRAME_UPLOAD_KEYSTORE_BASE64`：现有签名 keystore 文件的 Base64 内容；
- `DICEFRAME_UPLOAD_STORE_PASSWORD`：keystore 密码；
- `DICEFRAME_UPLOAD_KEY_ALIAS`：签名密钥别名；
- `DICEFRAME_UPLOAD_KEY_PASSWORD`：签名密钥密码。

缺少任一项时工作流停止，不回退调试签名。本地构建由
`scripts/configure-android-signing.ps1` 配置用户级 Gradle 属性，使用同一份密钥。
本地构建前运行 `npx expo prebuild --platform android --no-install` 同步版本与原生配置，
避免已存在的 `android/` 沿用旧 `versionName` / `versionCode`。

### 发新版与客户端「检查更新」

客户端进入首页、返回首页或应用回到前台时，会静默读取本仓库 GitHub Releases 的
latest release，与已安装 APK 的原生版本比较（Expo Go / Web 回退 `expo.version`）。
仅在发现新版后，首页右上角才显示带红点的铃铛，并间歇轻摇；没有新版或尚未取得更新
结果时不显示铃铛，也不占位。点击铃铛查看版本说明并下载 APK；**我的 → 检查更新**
始终可手动检查。离开首页或进入后台时停止摇动，系统开启减少动态效果时保持静止。
更新页与首页共享结果，自动检查成功后 6 小时内复用缓存，失败后 15 分钟再试，
手动检查不受该间隔限制。缓存仅保留在本次应用运行期间，重新启动会再次检查；
网络失败不弹窗，也不会清除已发现的新版提醒，红点持续显示至检测结果不再有新版。
GitHub API 限流或检查失败时，更新页提供直接打开 GitHub 发布页的入口。
APK 会按手机架构自动匹配拆分包，匹配不到时回退 `DiceFrame-android.apk`。
因此发新版时必须保持三者同步：

1. 升级 `app.json` 的 `expo.version` 与 `android.versionCode`（如 `0.1.0` → `0.2.0`）；
2. 打同版本号的 tag（如 `v0.2.0`）并创建 Release；
3. 把构建产物（至少 `DiceFrame-android.apk`）作为 Release asset 上传（Actions Artifact 不算，
   客户端找不到 APK asset 会报「最新发布没有可下载的 APK」）。

每次可检测的升级都要提高 `expo.version`，Android 的 `versionCode` 也必须递增。
只提高构建号不会触发新版提醒。Release 缺少 APK 会导致检查失败；签名不一致会导致
覆盖安装失败。发布前应核对 APK 的原生版本、构建号与签名，不能只检查配置文件。

## 目录导览

```
src/
├── app/                 # expo-router：index 分流、login/join 流程页、
│   │                    # (tabs)/ 一级 Tab（overview/characters/lorebook/profile）、play/ 二级对局页
│   └── (tabs)/
│       ├── overview.tsx     # 对局列表
│       ├── characters.tsx   # 跨对局角色名册
│       ├── lorebook.tsx     # 世界书（世界选择 + 词条）
│       └── profile.tsx      # 我的（设置菜单/身份/关于）
├── api/                 # client（鉴权+分享参数+自管理会话）、games、speech、assets、types
├── i18n/                # react-i18next：messages/web = 上游翻译镜像，messages/mobile = df 前缀功能簇
├── stream/gameStream.ts # SSE 通道（ticket/游标/重连/降级轮询）
├── stores/              # settings（持久化，含 themeMode/language）、game（对局态）
├── features/play/       # 时间线、GM 叙事解析渲染、行动输入、语音输入、TTS、角色面板、GM 工具
├── lib/                 # 主题令牌 JS 侧（theme.ts）、locale 解析、链接解析
└── components/ui/       # shadcn 风格基础组件（button/card/badge/icon-button/…）
```
