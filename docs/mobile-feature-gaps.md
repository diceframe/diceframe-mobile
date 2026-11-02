# 移动端功能差异清单

基于上游源码 `a2e7e2f6`（2026-11-02）的功能审计；上一轮基线为上游 `ec3964ab` / 移动端 `d20e2a5`。翻译 key 是否引用只能作为查找线索，不代表功能覆盖率。

## 本轮补齐（上游 a2e7e2f6）

- 镜像同步：`types.ts`（`run_lifecycle` / `gm_workspace_revision` / `rest_activity`、战斗目标 `is_dead` / `side`、法术目标约束）与四语文案；上游这轮只更新了中英，日德缺的 key 按约定以英文补齐。
- 结团只读：GM 准备结团时对局 state 仍是行动阶段，但服务端已拒收全部写请求（409 `RUN_READ_ONLY` / `RUN_ENDED`）；移动端按 `run_lifecycle.status` 锁住行动与语音输入，状态显示「准备中」，并给出明确提示，不再落到「刷新后重试」。SSE 新事件 `run_story_changed` 按刷新处理（原有兜底已覆盖）。
- 错误码文案：`RUN_READ_ONLY` / `RUN_ENDED` / `ADVENTURE_ENDED` 在上游 apiErrors 里没有文案，移动端补了自有映射。
- 行动恢复：新增 `CHECK_MODEL_NOT_CONFIGURED`（502，独立检定模型未配置，行动已保留）与 `ROUND_ROLLBACK_FAILED`（500），先刷新并提示具体原因。
- DF Agent 可续跑审批（上游 #564）：批量计划（资料册可见性）执行到一半失败、取消或遇到服务重启时，保留服务端回包里的 `pending`，显示逐项执行报告，「确认并继续剩余目标」走 `POST /assistant/agent/resume`；可续跑审批不按原时限判过期。

## 上一轮补齐（上游 ec3964ab）

- 镜像同步：`types.ts` 与四语文案；上游为大写错误码单独提供了文案（如 `PLAYER_ACCESS_CLOSED`）。
- CoC 孤注一掷：检定卡内申请 / 告知风险 / 拒绝 / 确认重掷 / 接受失败，待决项阻断行动输入。
- 剧情「角色对话」模式：`LogEntry.story` 旁白卡 + 说话人台词气泡（逐条朗读），SSE `story_update` 流式快照。
- 本局偏好（GM）：孤注一掷开关、默认显示快捷建议、骰子揭示方式、剧情表现；玩家可按对局 + 角色独立隐藏建议。
- CoC 奖励/惩罚骰明细：共享个位、十位组合与采用项。
- 行动提交失败恢复：已回滚可改后重发；已入账/结果不确定先刷新核对，已入账的行动刷新后清空草稿。
- 行动技能：行动区「本次技能」选择，随行动提交 `selected_skill`。
- 检定模式：玩家申请优势/劣势（CoC 奖励/惩罚骰），GM 授予/拒绝/清除，自动来源预览。
- 剧情立绘管理（GM）：换说话人头像、合并重复临时人物。
- 点击揭示：`dice_reveal_mode = click` 时检定卡先遮住，GM 或行动者揭开，显示揭示人。
- DF Agent 房主助手：流式对话、内容草稿审阅、待确认操作、页面跳转、会话管理（语音入口未移植）。
- 骰灵形象与跑团反应：对局时间线左下角的玻璃 d20，按检定、剧情、成长、同桌事件换表情并弹气泡；设置里可按类别关闭。战斗类反应等专业战斗界面落地后接入。

## 后续功能

| 范围 | 待补能力 |
|---|---|
| 冒险面板 | **阻断项，下一个 PR**：移动端建局能绑定冒险包，但对局里没有面板。「多选一」节点必须显式带 `choice_id` 完成，服务端自动推进不替人选，内置样板包「灯塔之夏」的告白节点在手机上会卡住。需要 `GET /games/{key}/adventure` + `POST /intents`（`adventure.node.complete` / `adventure.choice.request`），`progress.ended` 时锁输入；GM 的 AI 完成建议与忽略（`adventure.completion_suggestion.dismiss`）可随后补 |
| 结团 | 玩家侧：`GET /games/{key}/run-story` 的尾声、团录，`/run-story/export?kind=recap\|character` 导出团录、带走角色。GM 侧：准备/冻结、手写或 AI 起草尾声与团录、提交、取消、带角色进新局（`/run-story/prepare\|materials\|commit\|cancel\|generate/finale\|carry`）；剧情计划编辑表单重，建议留在 Web |
| 场景过渡叙事 | `LogEntry.state_changes`（GAL 场景推进写入）移动端不渲染 |
| AI 席位 | GM 为 AI 托管席位选服务商 / 模型 / 风格、失败重试（`/ai-seats`）；涉及服务商选择，纳入前需产品确认 |
| 队伍休息与资源恢复 | 规则支持休息中心时的全队长/短休入口与进度；CoC（`freeform_coc`）的过夜休息 / 治疗申请、GM 批准与发放（`/games/{key}/recovery*`），以及所有人可见的 `rest_activity` 休息通知 |
| DF Agent | 授权模式（建议 / 自动处理日常 / 接管本次任务，`/assistant/agent/authorization`）、任务进度与预算用完后「继续任务」（SSE `authorization` / `task`）、停止时调 `/assistant/agent/cancel`、能力目录（`/assistant/agent/capabilities`）、语音对话（`/assistant/speech`、`/assistant/transcription`） |
| 对局触控 | 快捷建议与显隐开关提到 44px（上游 #631）；当前约 30px |
| GAL 建局 | `play_mode: 'gal'`（强制单人 + `gal_narrative`，不带冒险包）及 `GAL_REQUIRES_SOLO` / `GAL_REQUIRES_NARRATIVE_RULE` 文案；上游 Web 也只是实验开关，好感度没有对外投影 |
| 战斗掷骰证据 | 战斗事件的 `rolls` / `advantage_mode` / `advantage_sources` 展示；移动端尚无专业战斗界面可挂载，随下方「专业规则战斗」一起做 |
| 俄语界面 | 上游新增 ru；移动端仍是四语，加语言需补全 df 文案簇 |
| 专业规则战斗 | available-actions、intents、decisions；上游已有 D&D 2024 战斗 HUD（#617）与法术效果（#619）；普通文本不能代替专业战斗操作 |
| 专业角色 | 规则建卡、跨规则转换复核、休息/生命骰、对局内升级资格和 XP 发放 |
| 专业战役 | 会前确认、教程、提案及队伍分支裁决 |
| 角色卡库 | DiceFrame/酒馆卡文件导入、选卡导出 |
| 规则库 | 实际规则内容编辑，当前只支持复制/删除 |
| 世界书 | 高级触发与注入配置、角色视角预览、批量生成与 JSON 导入/导出 |
| Hub 偏好 | 匿名统计开关/清除 Hub 身份，是否纳入手机管理范围需产品取舍 |

这轮核对过、移动端不用跟的：邀请链接与扫码载荷格式未变（`#/join?game=&share=1`、`diceframe://pair`）；三个手动检定修复只在服务端与 Web 表单（移动端没有手动检定界面）；登录页访问密码说明是 Web 弹窗；服务端下发的最低客户端版本升到 0.6.0，与当前版本相同。

运行中的 Web 曾出现本地上游源码未找到的“剧情奖励发放”设置；接入前先核实实际部署版本及契约。AI 服务商设置、P2P 仍在仓库范围之外。
