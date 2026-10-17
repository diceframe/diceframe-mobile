import { describe, expect, it } from 'vitest'

import { tensLabel, validPercentileDice } from './percentile-dice'

const dice = { units: 3, tens: [40, 0], candidates: [43, 3], taken_index: 1, bonus_dice: 1, penalty_dice: 0 }

describe('百分骰投影校验', () => {
  it('候选 = 十位 + 个位；00 + 0 记作 100', () => {
    expect(validPercentileDice(dice)).toBe(true)
    expect(validPercentileDice({ ...dice, units: 0, tens: [0, 70], candidates: [100, 70] })).toBe(true)
  })

  it('候选对不上、下标越界、十位不是整十都拒收', () => {
    expect(validPercentileDice({ ...dice, candidates: [43, 4] })).toBe(false)
    expect(validPercentileDice({ ...dice, taken_index: 2 })).toBe(false)
    expect(validPercentileDice({ ...dice, tens: [45, 0], candidates: [48, 3] })).toBe(false)
    expect(validPercentileDice({ ...dice, tens: [], candidates: [] })).toBe(false)
    expect(validPercentileDice(undefined)).toBe(false)
  })

  it('十位两位显示', () => {
    expect(tensLabel(0)).toBe('00')
    expect(tensLabel(70)).toBe('70')
  })
})
