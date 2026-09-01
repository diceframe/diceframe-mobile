import { describe, expect, it } from 'vitest'

import type { CheckResult } from '@/api/types'

import {
  canDecideLuckOf,
  checkAccentOf,
  checkDetailOf,
  checkKeyOf,
  checkMathOf,
  diceFacesOf,
  mergePendingLuck,
  statusLabelKeyOf,
} from '@/lib/check-details'

function check(overrides: CheckResult): CheckResult {
  return overrides
}

describe('checkKeyOf', () => {
  it('优先使用 check_id', () => {
    expect(checkKeyOf({ check_id: 'c1', roll: 5 })).toBe('c1')
  })

  it('check_id 缺失时回退到参与者+检定名+出目', () => {
    expect(checkKeyOf({ actor_uid: 'u1', label: '攀爬', roll: 12 })).toBe('u1|攀爬|12')
  })
})

describe('mergePendingLuck', () => {
  it('并集两处来源并过滤非 pending 项', () => {
    const pending = check({ check_id: 'a', luck_decision: 'pending' })
    const spent = check({ check_id: 'b', luck_decision: 'spent' })
    expect(mergePendingLuck([pending], [spent, pending])).toEqual([pending])
  })

  it('同一 check_id 以先到者为准，不重复渲染', () => {
    const first = check({ check_id: 'a', luck_decision: 'pending', luck_cost: 3 })
    const second = check({ check_id: 'a', luck_decision: 'pending', luck_cost: 9 })
    expect(mergePendingLuck([first], [second])).toEqual([first])
  })

  it('check_id 缺失的旧数据按参与者+检定名+出目去重', () => {
    const first = check({ actor_uid: 'u1', label: '侦查', roll: 40, luck_decision: 'pending' })
    const second = check({ actor_uid: 'u1', label: '侦查', roll: 40, luck_decision: 'pending' })
    expect(mergePendingLuck([], [first, second])).toEqual([first])
  })
})

describe('canDecideLuckOf', () => {
  const mine = check({ actor_uid: 'me', luck_decision: 'pending' })
  const others = check({ actor_uid: 'someone', luck_decision: 'pending' })
  const anonymous = check({ luck_decision: 'pending' })

  it('GM 对任何检定都可决议', () => {
    expect(canDecideLuckOf(others, 'me', true)).toBe(true)
    expect(canDecideLuckOf(anonymous, '', true)).toBe(true)
  })

  it('玩家只能决议自己名下的检定', () => {
    expect(canDecideLuckOf(mine, 'me')).toBe(true)
    expect(canDecideLuckOf(others, 'me')).toBe(false)
  })

  it('actor_uid 缺失或会话用户为空时不允许决议', () => {
    expect(canDecideLuckOf(anonymous, 'me')).toBe(false)
    expect(canDecideLuckOf(mine, '')).toBe(false)
  })
})

describe('checkMathOf', () => {
  it('d100 阈值检定：d100=roll / threshold%', () => {
    expect(checkMathOf(check({ dice: 'd100', roll: 33, threshold: 50 }), '对手')).toBe(
      'd100=33 / 50%',
    )
  })

  it('d20 检定：出目+加值=总计 / DC', () => {
    expect(
      checkMathOf(check({ dice: 'd20', roll: 8, modifier: 3, total: 11, dc: 12 }), '对手'),
    ).toBe('d20=8 + 3 = 11 / DC 12')
    expect(checkMathOf(check({ dice: 'd20', roll: 8, modifier: -1 }), '对手')).toBe('d20=8 - 1')
  })

  it('对抗检定附对手出目与加值，名字缺失用回退词', () => {
    expect(
      checkMathOf(
        check({
          dice: 'd20',
          roll: 10,
          modifier: 2,
          total: 12,
          opponent_roll: 7,
          opponent_modifier: 1,
          opponent_total: 8,
        }),
        '对手',
      ),
    ).toBe('d20=10 + 2 = 12 / 对手 d20=7 + 1 = 8')
  })
})

describe('diceFacesOf', () => {
  it('rolls 优先（优势/劣势两颗骰）', () => {
    expect(diceFacesOf(check({ rolls: [18, 4], roll: 18 }))).toEqual([18, 4])
  })

  it('rolls 缺失时退回单一 roll，非数字剔除', () => {
    expect(diceFacesOf(check({ roll: 13 }))).toEqual([13])
    expect(diceFacesOf(check({}))).toEqual([])
  })
})

describe('checkDetailOf', () => {
  it('hard_threshold 存在时给出困难/极难成功线', () => {
    const detail = checkDetailOf(
      check({ threshold: 50, hard_threshold: 25, extreme_threshold: 5, roll: 33 }),
      '对手',
    )
    expect(detail.successLevels).toEqual({ normal: 50, hard: 25, extreme: 5 })
    expect(detail.math).toBe('d100=33 / 50%')
  })

  it('hard_threshold 缺失时不硬造成功线', () => {
    expect(checkDetailOf(check({ roll: 9, dc: 12 }), '对手').successLevels).toBeNull()
  })

  it('修正明细/优势说明/协助按原样透传，缺失为空串', () => {
    const detail = checkDetailOf(
      check({
        roll: 15,
        modifier_breakdown: '熟练 +3 · 属性 +2',
        advantage_note: '优势（高地）',
        assist: ['张三', '李四'],
      }),
      '对手',
    )
    expect(detail.modifierBreakdown).toBe('熟练 +3 · 属性 +2')
    expect(detail.advantageNote).toBe('优势（高地）')
    expect(detail.assists).toBe('张三, 李四')
    expect(checkDetailOf(check({ roll: 15 }), '对手')).toMatchObject({
      modifierBreakdown: '',
      advantageNote: '',
      assists: '',
    })
  })
})

describe('checkAccentOf / statusLabelKeyOf', () => {
  it('大成功=鎏金、成功=绿、失败/大失败=红', () => {
    expect(checkAccentOf('critical')).toBe('gold-strong')
    expect(checkAccentOf('success')).toBe('success')
    expect(checkAccentOf('failure')).toBe('destructive')
    expect(checkAccentOf('fumble')).toBe('destructive')
  })

  it('结论 → 文案 key 映射', () => {
    expect(statusLabelKeyOf('critical')).toBe('dfCheckCritical')
    expect(statusLabelKeyOf('fumble')).toBe('dfCheckFumble')
    expect(statusLabelKeyOf('success')).toBe('checkSuccess')
    expect(statusLabelKeyOf('failure')).toBe('checkFailure')
  })
})
