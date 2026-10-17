import { describe, expect, it } from 'vitest'

import {
  currentNarrativePerspective,
  isLuckTimeoutSeconds,
  parseSessionPreferences,
  isNarrativePerspective,
  NARRATIVE_PERSPECTIVES,
  parseLuckTimeoutInput,
} from './game-settings'

describe('叙事视角', () => {
  it.each(NARRATIVE_PERSPECTIVES)('保留服务端支持的 %s', (value) => {
    expect(isNarrativePerspective(value)).toBe(true)
    expect(currentNarrativePerspective(value)).toBe(value)
  })

  it.each([undefined, null, ''])('缺省投影 %s 使用自动模式', (value) => {
    expect(currentNarrativePerspective(value)).toBe('auto')
  })

  it.each(['first_person', 'AUTO', ' immersive ', 0, false, {}])('未知视角 %s 不伪装成当前自动模式', (value) => {
    expect(isNarrativePerspective(value)).toBe(false)
    expect(currentNarrativePerspective(value)).toBeNull()
  })
})

describe('幸运超时输入', () => {
  it.each(['', ' ', '\t\n'])('空白 %j 表示不改，不能被转为禁用', (input) => {
    expect(parseLuckTimeoutInput(input)).toEqual({ kind: 'unchanged' })
  })

  it.each([
    ['0', 0], ['60', 60], ['3600', 3600], [' 120 ', 120], ['0060', 60], ['-0', 0],
  ] as const)('解析整数 %s', (input, seconds) => {
    expect(parseLuckTimeoutInput(input)).toEqual({ kind: 'valid', seconds })
  })

  it.each(['1.5', '60.0', '1e2', '0x10', 'Infinity', 'NaN', 'abc', '+60', '６０', '1 0'])('拒绝非十进制整数 %s', (input) => {
    expect(parseLuckTimeoutInput(input)).toEqual({ kind: 'invalid', reason: 'integer' })
  })

  it.each(['-1', '-3600'])('负数 %s 不能禁用或被截断', (input) => {
    expect(parseLuckTimeoutInput(input)).toEqual({ kind: 'invalid', reason: 'minimum' })
  })

  it.each(['3601', '999999999999999999999999999999', '9'.repeat(400)])('超过上限 %s 被拒绝', (input) => {
    expect(parseLuckTimeoutInput(input)).toEqual({ kind: 'invalid', reason: 'maximum' })
  })

  it.each([0, 1, 60, 3600])('API 数值边界接受 %s', (value) => {
    expect(isLuckTimeoutSeconds(value)).toBe(true)
  })

  it.each([-1, 3601, 0.5, NaN, Infinity, '60', '', null, undefined, true])('API 数值边界拒绝 %s', (value) => {
    expect(isLuckTimeoutSeconds(value)).toBe(false)
  })
})

describe('本局偏好投影', () => {
  it('完整响应按字段取值', () => {
    expect(parseSessionPreferences({
      ok: true,
      push_supported: true,
      preferences: { push_enabled: false, quick_actions_enabled: false, dice_reveal_mode: 'click', story_mode: 'dialogue', luck_timeout_seconds: 30 },
    })).toEqual({
      preferences: { push_enabled: false, quick_actions_enabled: false, dice_reveal_mode: 'click', story_mode: 'dialogue' },
      pushSupported: true,
      resumeFailed: false,
    })
  })

  it('旧服务端缺 quick_actions_enabled 时标为不支持；未知枚举回落缺省', () => {
    expect(parseSessionPreferences({ ok: true, preferences: { dice_reveal_mode: 'drag', story_mode: 'comic' } })).toEqual({
      preferences: { push_enabled: true, quick_actions_enabled: null, dice_reveal_mode: 'auto', story_mode: 'prose' },
      pushSupported: false,
      resumeFailed: false,
    })
    expect(parseSessionPreferences({ ok: true, preferences: {}, resume: { ok: false } })?.resumeFailed).toBe(true)
  })

  it('ok 不是 true 或缺 preferences 视为失败', () => {
    expect(parseSessionPreferences({ ok: false, error: 'x' })).toBeNull()
    expect(parseSessionPreferences({ ok: true })).toBeNull()
    expect(parseSessionPreferences(null)).toBeNull()
  })
})
