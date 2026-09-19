import { describe, expect, it } from 'vitest'

import {
  cardControlAt,
  cycleCardControl,
  defaultCardControl,
  normalizeCardControl,
  withCardControls,
} from './card-control'

describe('创建期逐卡控制方式', () => {
  it('第一张默认玩家，其余默认等待认领（不默认 AI，免得角色自己行动）', () => {
    expect(defaultCardControl(0)).toBe('human')
    expect(defaultCardControl(1)).toBe('unclaimed')
    expect(defaultCardControl(7)).toBe('unclaimed')
  })

  it('非法值按该位置的默认值收敛', () => {
    expect(normalizeCardControl('ai', 3)).toBe('ai')
    expect(normalizeCardControl('gm', 0)).toBe('human')
    expect(normalizeCardControl(undefined, 2)).toBe('unclaimed')
    expect(normalizeCardControl(42, 0)).toBe('human')
  })

  it('三态按契约顺序循环 human → ai → unclaimed → human', () => {
    const players = [{ control: 'human' }]
    const ai = cycleCardControl(players, 0)
    expect(cardControlAt(ai, 0)).toBe('ai')
    const unclaimed = cycleCardControl(ai, 0)
    expect(cardControlAt(unclaimed, 0)).toBe('unclaimed')
    expect(cardControlAt(cycleCardControl(unclaimed, 0), 0)).toBe('human')
  })

  it('循环不改动其它角色，也不原地修改入参', () => {
    const players = [{ name: 'A', control: 'human' }, { name: 'B', control: 'ai' }]
    const next = cycleCardControl(players, 1)
    expect(next[1]).toMatchObject({ name: 'B', control: 'unclaimed' })
    expect(next[0]).toMatchObject({ name: 'A', control: 'human' })
    expect(players[1].control).toBe('ai')
  })

  it('坏值被点到时先落回合法模式再取下一个，而不是被跳过', () => {
    expect(cardControlAt(cycleCardControl([{ control: 'nonsense' }], 0), 0)).toBe('ai')
  })

  it('越界下标不写入', () => {
    const players = [{ control: 'human' }]
    expect(cycleCardControl(players, 3)).toEqual([{ control: 'human' }])
    expect(cycleCardControl(players, -1)).toEqual([{ control: 'human' }])
  })

  it('补齐只填缺失的，已选的保持不变', () => {
    expect(withCardControls([{ control: 'ai' }, {}, { control: 'human' }])).toEqual([
      { control: 'ai' },
      { control: 'unclaimed' },
      { control: 'human' },
    ])
  })

  it('删角色后剩下的卡保留各自已选的控制方式（不会继承前一张）', () => {
    const players = withCardControls([{ name: 'A' }, { name: 'B', control: 'ai' }])
    const afterRemove = players.filter((_, index) => index !== 0)
    expect(cardControlAt(afterRemove, 0)).toBe('ai')
  })
})
