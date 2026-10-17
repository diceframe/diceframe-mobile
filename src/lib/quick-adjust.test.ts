import { describe, expect, it } from 'vitest'

import type { CharacterSheet } from '@/api/types'

import {
  clampHp,
  currencyOf,
  currencyPatch,
  hpOf,
  hpPatch,
  inventoryWithAdded,
  inventoryWithRemoved,
} from './quick-adjust'

const sheet = {
  hp: 8,
  max_hp: 12,
  resources: { hp: { current: 8, max: 12, label: '生命' }, san: { current: 50, max: 99 } },
  gold: 300,
  currency: { amount: 300, code: 'usd' },
  inventory: [{ name: '手电', qty: 1, effect: '照明' }, { name: '子弹', qty: 6 }],
} as unknown as CharacterSheet

describe('快速调整：HP', () => {
  it('读取与夹取：不超过上限、不低于 0，倒地合法', () => {
    expect(hpOf(sheet)).toEqual({ hp: 8, max: 12 })
    expect(clampHp(15, 12)).toEqual({ hp: 12, max: 12 })
    expect(clampHp(-3, 12)).toEqual({ hp: 0, max: 12 })
  })

  it('补丁同写 hp / max_hp / resources.hp，其它资源（理智）原样保留', () => {
    expect(hpPatch(sheet, { hp: 5, max: 12 })).toEqual({
      hp: 5,
      max_hp: 12,
      resources: { hp: { current: 5, max: 12, label: '生命', min: 0 }, san: { current: 50, max: 99 } },
    })
  })
})

describe('快速调整：余额', () => {
  it('gold 与 currency.amount 同写，currency 其余字段保留；不允许负数', () => {
    expect(currencyOf(sheet)).toBe(300)
    expect(currencyPatch(sheet, 425)).toEqual({ gold: 425, currency: { amount: 425, code: 'usd' } })
    expect(currencyPatch(sheet, -5)).toMatchObject({ gold: 0 })
  })
})

describe('快速调整：物品', () => {
  it('同名叠加，否则追加；空名不变', () => {
    expect(inventoryWithAdded(sheet, ' 子弹 ', 2)[1]).toMatchObject({ name: '子弹', qty: 8 })
    expect(inventoryWithAdded(sheet, '钥匙').at(-1)).toEqual({ name: '钥匙', qty: 1, effect: '' })
    expect(inventoryWithAdded(sheet, '  ')).toHaveLength(2)
  })

  it('移除：数量大于 1 减一，否则删行；越界不变；不改原卡', () => {
    expect(inventoryWithRemoved(sheet, 1)[1]).toMatchObject({ qty: 5 })
    expect(inventoryWithRemoved(sheet, 0).map((item) => item.name)).toEqual(['子弹'])
    expect(inventoryWithRemoved(sheet, 9)).toHaveLength(2)
    expect(sheet.inventory).toHaveLength(2)
  })
})
