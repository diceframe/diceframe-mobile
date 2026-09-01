import { describe, expect, it } from 'vitest'

import type { CharacterItem } from '@/api/types'
import {
  characterItemDetail,
  characterItemImageAssetId,
  characterItemGroups,
  characterItemName,
  characterItemQty,
  ITEM_NAME_FALLBACK,
  type CharacterItemLabels,
} from './character-items'

const LABELS: CharacterItemLabels = {
  weapon: '武器',
  armor: '护甲',
  item: '杂物',
  mainHand: '主手',
  offHand: '副手',
  armorSlot: '护甲位',
  head: '头部',
  noSlot: '不占部位',
  damage: '伤害',
  effect: '效果',
}

describe('characterItemName / characterItemQty', () => {
  it('无名条目回退占位符，数量仅在 >1 时返回', () => {
    expect(characterItemName({})).toBe(ITEM_NAME_FALLBACK)
    expect(characterItemName({ name: '  长剑 ' })).toBe('长剑')
    expect(characterItemQty({ name: 'x' })).toBeUndefined()
    expect(characterItemQty({ name: 'x', qty: 1 })).toBeUndefined()
    expect(characterItemQty({ name: 'x', qty: 3 })).toBe(3)
    expect(characterItemQty({ name: 'x', qty: Number.NaN })).toBeUndefined()
  })
})

describe('characterItemImageAssetId', () => {
  it('从扩展 image 字段取 asset_id，形状不对时返回空串', () => {
    expect(characterItemImageAssetId({ name: 'x', image: { asset_id: 'a1' } })).toBe('a1')
    expect(characterItemImageAssetId({ name: 'x', image: { asset_id: ' a1 ' } })).toBe('a1')
    expect(characterItemImageAssetId({ name: 'x', image: 'http://x/y.png' })).toBe('')
    expect(characterItemImageAssetId({ name: 'x' })).toBe('')
  })
})

describe('characterItemDetail', () => {
  it('装备：类型 · 槽位 · 伤害 · 品质，none 槽位与零伤害不展示', () => {
    expect(
      characterItemDetail({ name: '长剑', type: 'weapon', slot: 'main_hand', damage: 8, quality: '精制' }, 'equipment', LABELS),
    ).toBe('武器 · 主手 · 伤害 8 · 精制')
    expect(
      characterItemDetail({ name: '皮甲', type: 'armor', slot: 'none', damage: 0 }, 'equipment', LABELS),
    ).toBe('护甲')
  })

  it('背包：仅效果文本；关键物品：分类 · 备注（原始文本不本地化）', () => {
    expect(characterItemDetail({ name: '药水', effect: '恢复 2d4 HP' }, 'inventory', LABELS)).toBe(
      '效果: 恢复 2d4 HP',
    )
    expect(characterItemDetail({ name: '信物', category: '信物', note: '母亲的怀表' }, 'key_items', LABELS)).toBe(
      '信物 · 母亲的怀表',
    )
    expect(characterItemDetail({ name: '空白' }, 'key_items', LABELS)).toBe('')
  })
})

describe('characterItemGroups', () => {
  const sword: CharacterItem = { name: '长剑' }

  it('三组分栏，非数组/缺失字段兜底空数组', () => {
    expect(characterItemGroups(null)).toEqual({ equipment: [], inventory: [], keyItems: [] })
    expect(
      characterItemGroups({ equipment: [sword], inventory: 'bad' as never, keyItems: undefined }),
    ).toEqual({ equipment: [sword], inventory: [], keyItems: [] })
  })
})
