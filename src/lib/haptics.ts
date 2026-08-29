/**
 * 对局触觉反馈的纯逻辑层：事件词汇表、GM 输出→震动事件推导、各平台的模式表。
 *
 * 设计契约：AI 不直接"调用"震动——GM 在协议标签（ROLL/HP/COMBAT…）与状态卡
 * tone 里已经表达了语义，客户端把语义映射为震动事件。本文件必须保持零原生依赖
 * （不 import react-native / expo-haptics），单测直接覆盖；平台分流在
 * features/play/useHaptics.ts 的运行时层完成。
 */

export type HapticEvent =
  | 'dice' // 骰子滚动（ROLL 标签）
  | 'damage' // 受伤 / 负面状态（HP 减少、warn 状态卡）
  | 'combat' // 战斗结算（COMBAT 标签）
  | 'reward' // 拾获 / 增益（LOOT、XP、HP 增加）
  | 'decision' // 关键决策 / 私密感知，提醒注意
  | 'check-pass' // 检定成功
  | 'check-fail' // 检定失败
  | 'critical' // 检定大成功
  | 'fumble' // 检定大失败
  | 'submit' // 行动提交成功的轻确认（仅 UI 直调，不从叙事推导）

/**
 * 同一批叙事可能同时携带多个语义（COMBAT + HP:-3 + LOOT…），
 * 合并为一次震动时按紧迫度取最强，避免连续狂震。
 */
const EVENT_PRIORITY: HapticEvent[] = [
  'fumble',
  'critical',
  'damage',
  'check-fail',
  'check-pass',
  'combat',
  'dice',
  'reward',
  'decision',
  'submit',
]

export function pickStrongest(events: readonly HapticEvent[]): HapticEvent | null {
  for (const candidate of EVENT_PRIORITY) {
    if (events.includes(candidate)) return candidate
  }
  return null
}

/** 检定结果的结构化信号（只依赖判定所需字段，便于测试与复用） */
export interface CheckSignal {
  is_critical?: boolean
  is_fumble?: boolean
  verdict?: string
}

/** 一段 GM 输出中可提取震动语义的来源集合 */
export interface HapticSource {
  /** GM 原文（用于识别 formatTagLine 未渲染的标签，如 COMBAT） */
  text?: string
  /** parseGMText 产出的标签徽章（tone: hp-dn / hp-up / loot / roll / decision…） */
  tags?: readonly { tone: string }[]
  /** parseGMText 产出的状态卡（tone: good / warn） */
  states?: readonly { tone: string }[]
  /** 条目附带的检定结果 */
  checks?: readonly CheckSignal[]
}

const TAG_TONE_EVENTS: Record<string, HapticEvent> = {
  'hp-dn': 'damage',
  'hp-up': 'reward',
  loot: 'reward',
  roll: 'dice',
  decision: 'decision',
}

// formatTagLine 尚不为 COMBAT 标签产出徽章，这里直接从原文识别，避免动渲染层
const COMBAT_TAG_RE = /(^|\n)\s*COMBAT\s*(?::|$)/i

/** 从单条 GM 输出推导震动事件（去重；无语义时返回空数组） */
export function deriveHapticEvents(source: HapticSource): HapticEvent[] {
  const events = new Set<HapticEvent>()
  for (const tag of source.tags ?? []) {
    const event = TAG_TONE_EVENTS[tag.tone]
    if (event) events.add(event)
  }
  for (const state of source.states ?? []) {
    if (state.tone === 'warn') events.add('damage')
  }
  if (source.text && COMBAT_TAG_RE.test(source.text)) events.add('combat')
  for (const check of source.checks ?? []) {
    if (check.is_critical) events.add('critical')
    else if (check.is_fumble) events.add('fumble')
    else if (String(check.verdict || '').match(/成功|success/i)) events.add('check-pass')
    else events.add('check-fail')
  }
  return [...events]
}

/**
 * Android 震动节奏表（Vibration pattern：[等待, 震, 停, 震…] 单位 ms）。
 * iOS 公开 API 不支持自定义节奏（只能挑 Taptic 预设），节奏差异只在 Android 生效。
 */
const ANDROID_PATTERNS: Record<HapticEvent, number[]> = {
  dice: [0, 30, 60, 30, 60, 30], // 三连轻点=骰子滚动
  damage: [0, 200, 80, 90], // 重击带余震
  combat: [0, 60, 70, 60], // 双击对撞
  reward: [0, 35, 50, 35, 50, 70], // 轻快三连
  decision: [0, 90], // 单次中等提醒
  'check-pass': [0, 45, 70, 45], // 上行双点
  'check-fail': [0, 280], // 长震
  critical: [0, 40, 50, 40, 50, 40, 50, 140], // 连点收长音
  fumble: [0, 300, 120, 300], // 双重长震
  submit: [0, 20], // 极轻确认
}

export function patternFor(event: HapticEvent): number[] {
  return ANDROID_PATTERNS[event]
}

/** iOS expo-haptics 预设描述；repeats/gapMs 由运行时按间隔补发以营造节奏 */
export interface HapticSpec {
  kind: 'impact' | 'notification'
  style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
  type?: 'success' | 'warning' | 'error'
  repeats?: number
  gapMs?: number
}

const IOS_SPECS: Record<HapticEvent, HapticSpec> = {
  dice: { kind: 'impact', style: 'light', repeats: 3, gapMs: 90 },
  damage: { kind: 'impact', style: 'heavy' },
  combat: { kind: 'impact', style: 'medium', repeats: 2, gapMs: 110 },
  reward: { kind: 'notification', type: 'success' },
  decision: { kind: 'impact', style: 'medium' },
  'check-pass': { kind: 'notification', type: 'success' },
  'check-fail': { kind: 'notification', type: 'error' },
  critical: { kind: 'notification', type: 'success', repeats: 2, gapMs: 130 },
  fumble: { kind: 'impact', style: 'heavy', repeats: 2, gapMs: 220 },
  submit: { kind: 'impact', style: 'light' },
}

export function specFor(event: HapticEvent): HapticSpec {
  return IOS_SPECS[event]
}
