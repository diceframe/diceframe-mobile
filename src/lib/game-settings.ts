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
