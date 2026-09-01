import { describe, expect, it } from 'vitest'

import {
  LORE_PUBLIC_VISIBILITY_MARKERS,
  LORE_TIERS,
  LORE_TYPE_ORDER,
  normalizeLoreType,
  normalizeTier,
  normalizeVisibilityValues,
  parseVisibilityTargets,
  sanitizeCharacterVisibility,
  toLoreEntryView,
  visibilityForMode,
  visibilityModeOf,
} from './lorebook'

describe('normalizeLoreType', () => {
  it('9 类全集一一对应，映射无损往返', () => {
    expect(LORE_TYPE_ORDER).toEqual(['npc', 'location', 'faction', 'item', 'event', 'puzzle', 'spell', 'class', 'other'])
    for (const type of LORE_TYPE_ORDER) {
      expect(normalizeLoreType(type)).toBe(type)
    }
  })

  it('puzzle/spell/class 不再折叠为 other（历史缺陷回归）', () => {
    expect(normalizeLoreType('puzzle')).toBe('puzzle')
    expect(normalizeLoreType('spell')).toBe('spell')
    expect(normalizeLoreType('class')).toBe('class')
  })

  it('未知/缺省/空白归 other，老数据的 other 保持 other', () => {
    expect(normalizeLoreType('creature')).toBe('other')
    expect(normalizeLoreType(undefined)).toBe('other')
    expect(normalizeLoreType(null)).toBe('other')
    expect(normalizeLoreType('')).toBe('other')
    expect(normalizeLoreType('  npc ')).toBe('npc')
    expect(normalizeLoreType('other')).toBe('other')
  })
})

describe('normalizeTier', () => {
  it('三档原样保留，与可见性维度无关', () => {
    expect(LORE_TIERS).toEqual(['core', 'background', 'archived'])
    expect(normalizeTier('core')).toBe('core')
    expect(normalizeTier('background')).toBe('background')
    expect(normalizeTier('archived')).toBe('archived')
  })

  it('非法/缺省回落 background', () => {
    expect(normalizeTier('visible')).toBe('background')
    expect(normalizeTier(undefined)).toBe('background')
  })
})

describe('normalizeVisibilityValues', () => {
  it('数组原样保留（trim + 去空）', () => {
    expect(normalizeVisibilityValues([' u1', '', 'u2'])).toEqual(['u1', 'u2'])
  })

  it('历史字符串形态：JSON 数组 / 逗号 / 顿号分隔', () => {
    expect(normalizeVisibilityValues('["u1","u2"]')).toEqual(['u1', 'u2'])
    expect(normalizeVisibilityValues('u1, u2')).toEqual(['u1', 'u2'])
    expect(normalizeVisibilityValues('u1、u2')).toEqual(['u1', 'u2'])
  })

  it('空值与非字符串非数组归空数组（仅 GM）', () => {
    expect(normalizeVisibilityValues(undefined)).toEqual([])
    expect(normalizeVisibilityValues(null)).toEqual([])
    expect(normalizeVisibilityValues('')).toEqual([])
    expect(normalizeVisibilityValues(42)).toEqual([])
  })
})

describe('visibilityModeOf（徽章与表单档位派生）', () => {
  it('空/缺省 -> gm（仅 GM）', () => {
    expect(visibilityModeOf([])).toBe('gm')
    expect(visibilityModeOf(undefined)).toBe('gm')
    expect(visibilityModeOf('')).toBe('gm')
  })

  it('含公开标记（canonical * 与别名）-> public（全队）', () => {
    expect(visibilityModeOf(['*'])).toBe('public')
    expect(visibilityModeOf(['public'])).toBe('public')
    expect(visibilityModeOf(['公开'])).toBe('public')
    // 大小写不敏感：后端 casefold，历史 'PUBLIC' 不能落进 characters 档
    expect(visibilityModeOf(['PUBLIC'])).toBe('public')
    expect(visibilityModeOf(['*'])).toBe('public')
  })

  it('具体成员名单 -> characters（指定成员）', () => {
    expect(visibilityModeOf(['u1'])).toBe('characters')
    expect(visibilityModeOf(['u1', 'u2'])).toBe('characters')
    expect(visibilityModeOf('爱丽丝')).toBe('characters')
  })

  it('所有公开标记常量都判为 public，保证别名识别无遗漏', () => {
    for (const marker of LORE_PUBLIC_VISIBILITY_MARKERS) {
      expect(visibilityModeOf([marker])).toBe('public')
    }
  })
})

describe('sanitizeCharacterVisibility', () => {
  it('剥掉公开标记，避免档位与内容不一致', () => {
    expect(sanitizeCharacterVisibility(['*', 'u1', '公开', 'u2'])).toEqual(['u1', 'u2'])
  })

  it('大小写不敏感去重、trim、去空', () => {
    expect(sanitizeCharacterVisibility(['u1', 'U1', ' u2 ', ''])).toEqual(['u1', 'u2'])
  })
})

describe('visibilityForMode（保存前按档位写 visible_to）', () => {
  it('gm 写 []，public 写 ["*"]', () => {
    expect(visibilityForMode('gm', ['u1'])).toEqual([])
    expect(visibilityForMode('public', [])).toEqual(['*'])
  })

  it('characters 保留点名并清洗，不混入公开标记', () => {
    expect(visibilityForMode('characters', ['*', 'u1', 'u1'])).toEqual(['u1'])
  })
})

describe('parseVisibilityTargets', () => {
  it('逗号/顿号/中文逗号分隔均可解析并过 sanitize', () => {
    expect(parseVisibilityTargets('u1, u2、爱丽丝，*')).toEqual(['u1', 'u2', '爱丽丝'])
    expect(parseVisibilityTargets('')).toEqual([])
  })
})

describe('toLoreEntryView', () => {
  it('无损保留服务端 type/tier/visible_to，visible_to 历史字符串形态也归一化', () => {
    expect(toLoreEntryView({ id: 'e1', name: '秘银矿', type: 'item', tier: 'core', content: '……', visible_to: '["u1","u2"]' })).toEqual({
      id: 'e1',
      title: '秘银矿',
      content: '……',
      type: 'item',
      tier: 'core',
      visibility: 'characters',
      visibleTo: ['u1', 'u2'],
    })
  })

  it('type=spell 的条目编辑后类型不丢失（数据污染回归）', () => {
    const view = toLoreEntryView({ id: 'e2', name: '火球术', type: 'spell' })
    expect(view?.type).toBe('spell')
    // 编辑表单原样带回原 type，保存写回仍是 spell
    expect(normalizeLoreType(view?.type)).toBe('spell')
  })

  it('tier=archived 不再被误读为「仅 GM 可见」', () => {
    // 回归：旧实现把 isPublic 绑在 tier 上；现在 visible_to 才是可见性事实
    const view = toLoreEntryView({ id: 'e3', name: '彩蛋', tier: 'archived', visible_to: ['*'] })
    expect(view?.tier).toBe('archived')
    expect(view?.visibility).toBe('public')
  })

  it('缺省 tier/visible_to 的条目得到默认档', () => {
    const view = toLoreEntryView({ id: 'e4', name: '酒馆' })
    expect(view?.tier).toBe('background')
    expect(view?.visibility).toBe('gm')
    expect(view?.visibleTo).toEqual([])
  })

  it('无 id 的脏数据丢弃', () => {
    expect(toLoreEntryView({ name: '幽灵条目' })).toBeNull()
  })
})
