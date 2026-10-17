/** 仅接受当前服务端支持的视角，避免未知投影值被误显示成已选的自动模式。 */
export const NARRATIVE_PERSPECTIVES = ['auto', 'immersive', 'third_person'] as const
export type NarrativePerspective = (typeof NARRATIVE_PERSPECTIVES)[number]

export function isNarrativePerspective(value: unknown): value is NarrativePerspective {
  return value === 'auto' || value === 'immersive' || value === 'third_person'
}

export function currentNarrativePerspective(value: unknown): NarrativePerspective | null {
  // 与上游工具栏一致，旧存档缺省值代表自动；未知的非空值不做猜测。
  if (value == null || value === '') return 'auto'
  return isNarrativePerspective(value) ? value : null
}

export function isLuckTimeoutSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3600
}

export type LuckTimeoutInput =
  | { kind: 'unchanged' }
  | { kind: 'valid'; seconds: number }
  | { kind: 'invalid'; reason: 'integer' | 'minimum' | 'maximum' }

/** 空白不能经过 Number 转成 0；也不允许指数、小数或十六进制被自动转换。 */
export function parseLuckTimeoutInput(input: string): LuckTimeoutInput {
  const trimmed = input.trim()
  if (!trimmed) return { kind: 'unchanged' }
  if (!/^-?\d+$/.test(trimmed)) return { kind: 'invalid', reason: 'integer' }
  const seconds = Number(trimmed)
  if (seconds < 0) return { kind: 'invalid', reason: 'minimum' }
  if (seconds > 3600) return { kind: 'invalid', reason: 'maximum' }
  return { kind: 'valid', seconds: seconds === 0 ? 0 : seconds }
}

/**
 * GET/POST /games/{key}/preferences 的本端投影（上游 features/game-preferences/model.ts）。
 * 移动端只管理桌面上常用的四项：孤注一掷开关、快捷建议默认显示、骰子揭示方式、剧情表现；
 * 视角与幸运超时仍走各自的独立端点（上方），GM 文风与成长策略留在 Web。
 */
export interface SessionPreferences {
  push_enabled: boolean
  /** 旧服务端不下发该字段：null = 不支持，开关置灰（对齐上游 quickActionsSupported） */
  quick_actions_enabled: boolean | null
  dice_reveal_mode: 'auto' | 'click'
  story_mode: 'prose' | 'dialogue'
}

export interface SessionPreferencesState {
  preferences: SessionPreferences
  /** 规则不支持孤注一掷时不显示该开关 */
  pushSupported: boolean
  /** 关孤注一掷会关掉进行中的申请并尝试继续本轮；设置已存但续跑失败时为 true */
  resumeFailed: boolean
}

export type SessionPreferencesPatch = Partial<Record<'push_enabled' | 'quick_actions_enabled', boolean>>
  & Partial<Pick<SessionPreferences, 'dice_reveal_mode' | 'story_mode'>>

/** 缺省值同上游 defaultGamePreferences；未知枚举值按缺省显示，不当成已选的其它项。 */
export function parseSessionPreferences(raw: unknown): SessionPreferencesState | null {
  if (!raw || typeof raw !== 'object') return null
  const response = raw as { ok?: unknown; preferences?: unknown; push_supported?: unknown; resume?: { ok?: unknown } }
  if (response.ok !== true || !response.preferences || typeof response.preferences !== 'object') return null
  const value = response.preferences as Record<string, unknown>
  return {
    preferences: {
      push_enabled: value.push_enabled !== false,
      quick_actions_enabled: typeof value.quick_actions_enabled === 'boolean' ? value.quick_actions_enabled : null,
      dice_reveal_mode: value.dice_reveal_mode === 'click' ? 'click' : 'auto',
      story_mode: value.story_mode === 'dialogue' ? 'dialogue' : 'prose',
    },
    pushSupported: response.push_supported === true,
    resumeFailed: response.resume?.ok === false,
  }
}
