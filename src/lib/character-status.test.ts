import { describe, expect, it } from 'vitest'

import type { CharacterSheet } from '@/api/types'
import { characterStatusFlags, deathSaveCounts } from './character-status'

describe('characterStatusFlags', () => {
  it('解析 downed/stable 与 deceased，其余状态只透传 raw', () => {
    expect(characterStatusFlags({ status: 'downed' } as CharacterSheet)).toEqual({
      deceased: false,
      downed: true,
      stable: false,
      raw: 'downed',
    })
    expect(characterStatusFlags({ status: 'stable' } as CharacterSheet)).toMatchObject({
      downed: false,
      stable: true,
    })
    expect(characterStatusFlags({ deceased: true } as CharacterSheet)).toMatchObject({
      deceased: true,
      downed: false,
    })
    expect(characterStatusFlags({ status: 'blessed' } as CharacterSheet)).toMatchObject({
      downed: false,
      stable: false,
      raw: 'blessed',
    })
  })

  it('无 sheet / 脏数据时全 false、raw 空串', () => {
    expect(characterStatusFlags(null)).toEqual({
      deceased: false,
      downed: false,
      stable: false,
      raw: '',
    })
    expect(characterStatusFlags({ status: 42 } as never)).toMatchObject({ raw: '' })
  })
})

describe('deathSaveCounts', () => {
  it('解析 success/failure，缺失值按 0 计', () => {
    expect(deathSaveCounts({ death_saves: { success: 2, failure: 1 } } as CharacterSheet)).toEqual({
      success: 2,
      failure: 1,
    })
    expect(deathSaveCounts({ death_saves: {} } as CharacterSheet)).toEqual({
      success: 0,
      failure: 0,
    })
  })

  it('形状不对（缺失/非对象/数组）返回 null，负数收敛为 0', () => {
    expect(deathSaveCounts(null)).toBeNull()
    expect(deathSaveCounts({} as CharacterSheet)).toBeNull()
    expect(deathSaveCounts({ death_saves: 'downed' } as never)).toBeNull()
    expect(deathSaveCounts({ death_saves: [1] } as never)).toBeNull()
    expect(deathSaveCounts({ death_saves: { success: -3, failure: Number.NaN } } as CharacterSheet)).toEqual({
      success: 0,
      failure: 0,
    })
  })
})
