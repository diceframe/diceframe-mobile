import { describe, expect, it } from 'vitest'

import {
  deriveHapticEvents,
  patternFor,
  pickStrongest,
  specFor,
  type HapticEvent,
} from './haptics'

describe('deriveHapticEvents', () => {
  it('标签 tone 映射：HP 减=受伤，HP 增/拾获=奖励，ROLL=骰子，DECISION=决策', () => {
    expect(deriveHapticEvents({ tags: [{ tone: 'hp-dn' }] })).toEqual(['damage'])
    expect(deriveHapticEvents({ tags: [{ tone: 'hp-up' }, { tone: 'loot' }] })).toEqual(['reward'])
    expect(deriveHapticEvents({ tags: [{ tone: 'roll' }] })).toEqual(['dice'])
    expect(deriveHapticEvents({ tags: [{ tone: 'decision' }] })).toEqual(['decision'])
  })

  it('无关标签 tone（gold/npc/scene 等）不产生事件', () => {
    expect(deriveHapticEvents({ tags: [{ tone: 'gold' }, { tone: 'npc' }, { tone: 'scene' }] })).toEqual([])
  })

  it('warn 状态卡视为受伤语义，good 不触发', () => {
    expect(deriveHapticEvents({ states: [{ tone: 'warn' }, { tone: 'good' }] })).toEqual(['damage'])
  })

  it('原文中的 COMBAT 标签行推导战斗', () => {
    expect(deriveHapticEvents({ text: '正文\n---\nCOMBAT: 命中' })).toEqual(['combat'])
    expect(deriveHapticEvents({ text: 'combat' })).toEqual(['combat'])
    expect(deriveHapticEvents({ text: '正文里提到 combat 这个词但没有标签行' })).toEqual([])
  })

  it('检定结果：大成功/大失败字段优先，verdict 文本兜底', () => {
    expect(deriveHapticEvents({ checks: [{ is_critical: true }] })).toEqual(['critical'])
    expect(deriveHapticEvents({ checks: [{ is_fumble: true }] })).toEqual(['fumble'])
    expect(deriveHapticEvents({ checks: [{ verdict: '成功' }] })).toEqual(['check-pass'])
    expect(deriveHapticEvents({ checks: [{ verdict: '失败' }] })).toEqual(['check-fail'])
    expect(deriveHapticEvents({ checks: [{ verdict: '' }] })).toEqual(['check-fail'])
  })

  it('多语义去重合并为事件集合', () => {
    const events = deriveHapticEvents({
      text: '---\nCOMBAT: 命中',
      tags: [{ tone: 'hp-dn' }, { tone: 'hp-dn' }],
      states: [{ tone: 'warn' }],
      checks: [{ verdict: '成功' }],
    })
    expect(events.sort()).toEqual(['check-pass', 'combat', 'damage'].sort())
  })

  it('空输入返回空数组', () => {
    expect(deriveHapticEvents({})).toEqual([])
  })
})

describe('pickStrongest', () => {
  it('按紧迫度取最强：大失败 > 受伤 > 骰子 > 奖励', () => {
    expect(pickStrongest(['damage', 'dice', 'fumble'])).toBe('fumble')
    expect(pickStrongest(['dice', 'damage'])).toBe('damage')
    expect(pickStrongest(['reward', 'dice'])).toBe('dice')
  })

  it('空集合返回 null', () => {
    expect(pickStrongest([])).toBeNull()
  })
})

describe('patternFor（Android Vibration pattern）', () => {
  const EVENTS: HapticEvent[] = [
    'dice',
    'damage',
    'combat',
    'reward',
    'decision',
    'check-pass',
    'check-fail',
    'critical',
    'fumble',
    'submit',
  ]

  it('每个事件都有 pattern，且结构合法（首元素无延迟、奇数位震动时长为正）', () => {
    for (const event of EVENTS) {
      const pattern = patternFor(event)
      expect(pattern.length, event).toBeGreaterThan(0)
      expect(pattern[0], event).toBe(0)
      pattern.forEach((value, index) => {
        if (index % 2 === 1) expect(value, `${event}[${index}]`).toBeGreaterThan(0)
      })
    }
  })

  it('各事件 pattern 互不相同（保证手感可区分）', () => {
    const patterns = EVENTS.map((event) => JSON.stringify(patternFor(event)))
    expect(new Set(patterns).size).toBe(EVENTS.length)
  })
})

describe('specFor（iOS expo-haptics 预设）', () => {
  it('impact 类必带 style，notification 类必带 type', () => {
    const events: HapticEvent[] = [
      'dice',
      'damage',
      'combat',
      'reward',
      'decision',
      'check-pass',
      'check-fail',
      'critical',
      'fumble',
      'submit',
    ]
    for (const event of events) {
      const spec = specFor(event)
      if (spec.kind === 'impact') expect(spec.style, event).toBeDefined()
      else expect(spec.type, event).toBeDefined()
      if (spec.repeats) expect(spec.gapMs, event).toBeGreaterThan(0)
    }
  })
})
