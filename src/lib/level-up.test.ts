import { describe, expect, it } from 'vitest'

import type { CharacterSheet, RuleAttribute } from '@/api/types'
import { buildLevelUpAttributes, levelUpAttributes, levelUpPoints } from './level-up'

const rules: RuleAttribute[] = [
  { key: 'str', name: '力量', min: 1, max: 20 },
  { key: 'dex', name: '敏捷', min: 1, max: 20 },
]
const sheet: CharacterSheet = {
  attributes: { str: 18, dex: 12, custom: 7 },
  level_up_points: 3,
}

describe('升级属性点', () => {
  it('允许分配部分点数，并保留规则之外的属性和原角色数据', () => {
    expect(buildLevelUpAttributes(sheet, rules, { str: 1 })).toEqual({ str: 19, dex: 12, custom: 7 })
    expect(sheet.attributes).toEqual({ str: 18, dex: 12, custom: 7 })
    expect(sheet.level_up_points).toBe(3)
  })

  it('允许恰好用完点数并达到属性上限', () => {
    expect(buildLevelUpAttributes(sheet, rules, { str: 2, dex: 1 })).toEqual({ str: 20, dex: 13, custom: 7 })
  })

  it.each<Record<string, number>>([
    { str: 2, dex: 2 },
    { str: 3 },
    { str: -1 },
    { str: 0.5 },
    { str: NaN },
    { str: Infinity },
    { custom: 1 },
    { unknown: 1 },
    { str: 0 },
    {},
  ])('拒绝超支、越界、减少原属性或非法增量 %j', (additions) => {
    expect(buildLevelUpAttributes(sheet, rules, additions)).toBeNull()
  })

  it('提交时以最新的点数和属性上限重新校验', () => {
    expect(buildLevelUpAttributes({ ...sheet, level_up_points: 1 }, rules, { dex: 2 })).toBeNull()
    expect(buildLevelUpAttributes({ ...sheet, attributes: { str: 20 } }, rules, { str: 1 })).toBeNull()
  })

  it.each([undefined, 0, -1, 1.5, NaN, Infinity])('无合法剩余点数 %s 时不能分配', (points) => {
    const current = { ...sheet, level_up_points: points }
    expect(levelUpPoints(current)).toBe(0)
    expect(buildLevelUpAttributes(current, rules, { dex: 1 })).toBeNull()
  })

  it('未加载角色或规则时不能提交，不猜测缺失属性的初始值', () => {
    expect(buildLevelUpAttributes(null, rules, { dex: 1 })).toBeNull()
    expect(buildLevelUpAttributes(sheet, [], { dex: 1 })).toBeNull()
    expect(levelUpAttributes({ attributes: { dex: 12 } }, rules)).toEqual([rules[1]])
    expect(buildLevelUpAttributes({ ...sheet, attributes: { dex: 12 } }, rules, { str: 1 })).toBeNull()
  })

  it('忽略无效的规则范围和非数值属性', () => {
    expect(levelUpAttributes({ attributes: { str: NaN, dex: 12 } }, rules)).toEqual([rules[1]])
    expect(levelUpAttributes(sheet, [{ key: 'str', min: 20, max: 1 }])).toEqual([])
  })
})
