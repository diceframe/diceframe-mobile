# DiceFrame 移动客户端

DiceFrame（AI 跑团引擎）的 React Native 客户端。**v1 聚焦核心游玩体验**：
语音输入（原生录音，不受浏览器安全上下文限制——这是本客户端立项的直接原因）、
实时流式叙事（SSE）、行动提交、检定/运气卡、角色面板、基础 GM 操作。

## 技术栈

| 项 | 选择 |
|---|---|
| 框架 | Expo SDK 57（React Native 0.86 / React 19.2 / New Architecture） |
| 路由 | expo-router（文件式；一级双 Tab + 二级对局页） |
| 主题 | 与 Web 端统一：`--df-*` 令牌移植（暗=midnight / 亮=light，跟随系统），鎏金 + 青蓝 |
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

## 开发调试（局域网跑团场景）

前置：Node ≥ 20；PC 上运行 DiceFrame 服务端（`python web_server.py`，默认端口 18000）。

```bash
cd mobile
npm install
npx expo start        # 手机装 Expo Go 扫码，或 Android 调试构建
```

如果使用内网穿透把 Expo 暴露给外部设备，隧道应配置为：本地 `127.0.0.1:8081`，远程端口例如
`32218`。本机 Metro 仍然固定监听 `8081`，不要把本地端口改成 `32218`。

把隧道公网地址写进本机专用的 `mobile/.env.local`：

```env
DICEFRAME_EXPO_PROXY_URL=http://43.248.188.28:32218
```

之后直接运行：

```powershell
npm run start:tunnel
```

这个命令会自动把本机配置转换为 Expo 的对外地址，只覆盖二维码/开发服务器地址，不改变本机
Metro 的 `8081` 端口。`mobile/.env.local` 已被 Git 忽略，不会提交个人隧道地址。

1. App 内"服务器地址"填 PC 的局域网地址（如 `192.168.1.5:18000`）
2. Owner 输入访问密码登录；玩家从 Web 端复制分享链接，在 App「通过分享链接加入」粘贴
3. 语音输入需服务端配置 ASR（OpenAI 兼容转写端点），否则麦克风按钮自动隐藏

说明：
- `app.json` 已开启 `usesCleartextTraffic`，Android 允许局域网明文 HTTP
- Expo Go 内可直接测试录音/播放；独立 APK 构建用 `npx expo run:android` 或 EAS
- iOS：代码已预留（ATS 例外在出包时启用），需 Mac 或 EAS 云构建验证

## 与 Web 端（frontend-v2）的关系

- 后端零改动，REST + SSE 契约完全一致
- **类型契约**：`src/api/types.ts` 是 `frontend-v2/src/api/types.ts` 的 v1 子集副本，
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

## 目录导览

```
src/
├── app/                 # expo-router：index 分流、login/join 流程页、
│   │                    # (tabs)/ 一级双 Tab（overview + profile）、play/ 二级对局页
│   └── (tabs)/
│       ├── overview/    # Tab1 对局列表
│       └── profile.tsx  # Tab2 我的（服务器切换/身份/语速/关于）
├── api/                 # client（鉴权+分享参数+自管理会话）、games、speech、assets、types
├── stream/gameStream.ts # SSE 通道（ticket/游标/重连/降级轮询）
├── stores/              # settings（持久化）、game（对局态，镜像 Web useGame.ts）
├── features/play/       # 时间线、GM 叙事解析渲染、行动输入、语音输入、TTS、角色面板、GM 工具
├── lib/                 # 主题令牌 JS 侧（theme-colors）、文案、链接解析
└── components/ui/       # shadcn 风格基础组件（button/card/badge/icon-button/…）
```
