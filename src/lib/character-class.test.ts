import { describe, expect, it } from 'vitest'

import { classFeatureList, classResourcePercent, classResourceRows } from './character-class'

describe('职业能力投影', () => {
  it('没有字段的老存档给空数组', () => {
    expect(classFeatureList({})).toEqual([])
    expect(classFeatureList(null)).toEqual([])
    expect(classFeatureList({ class_features: 'nope' } as never)).toEqual([])
  })

  it('原样返回服务端投影，不做筛选或排序', () => {
    const features = [
      { id: 'martial_arts', name: '武艺' },
      { id: 'unarmored_movement', name: '无甲疾行', summary: '移速提升' },
    ]
    expect(classFeatureList({ class_features: features })).toEqual(features)
  })
})

describe('职业资源投影', () => {
  it('上限为 0 的行不展示（当前等级还拿不到的资源）', () => {
    expect(classResourceRows({
      class_resources: [
        { id: 'focus', name: '专注点', current: 2, maximum: 3 },
        { id: 'ki', name: '气', current: 0, maximum: 0 },
      ],
    })).toEqual([{ id: 'focus', name: '专注点', current: 2, maximum: 3 }])
  })

  it('没有字段的老存档给空数组', () => {
    expect(classResourceRows({})).toEqual([])
    expect(classResourceRows(null)).toEqual([])
  })

  it('百分比按 current/maximum，并钳在 0–100', () => {
    expect(classResourcePercent({ id: 'f', name: '专注点', current: 3, maximum: 4 })).toBe(75)
    expect(classResourcePercent({ id: 'f', name: '专注点', current: 0, maximum: 4 })).toBe(0)
    // 服务端给出越界值时按满格/空格画，不画出界
    expect(classResourcePercent({ id: 'f', name: '专注点', current: 9, maximum: 4 })).toBe(100)
    expect(classResourcePercent({ id: 'f', name: '专注点', current: -1, maximum: 4 })).toBe(0)
    expect(classResourcePercent({ id: 'f', name: '专注点', current: 1, maximum: 0 })).toBe(0)
  })
})
