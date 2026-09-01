import { describe, expect, it } from 'vitest'

import type { CharacterCard, CharacterPortrait } from '@/api/types'
import {
  applyCardToDraft,
  buildJoinNewPayload,
  joinFormReady,
} from './join-form'

function cardOf(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    character_name: '莉拉',
    race: '提夫林',
    class: '术士',
    ...overrides,
  }
}

describe('applyCardToDraft（选卡合并，对齐 Web applyCard 的展开顺序）', () => {
  it('卡值覆盖同名手填字段', () => {
    const merged = applyCardToDraft(
      { characterName: '手填名', background: '手填背景', portrait: { kind: 'builtin', id: 'a' } },
      cardOf({ background: '卡上背景', portrait: { kind: 'upload', asset_id: 'x' } }),
    )
    expect(merged).toEqual({
      characterName: '莉拉',
      background: '卡上背景',
      portrait: { kind: 'upload', asset_id: 'x' },
    })
  })

  it('卡上缺 background/portrait 键时保留手填值（Web 展开只覆盖卡上存在的键）', () => {
    const merged = applyCardToDraft(
      { characterName: '旧名', background: '手填背景', portrait: { kind: 'builtin', id: 'a' } },
      cardOf({ background: undefined, portrait: undefined }),
    )
    expect(merged.background).toBe('手填背景')
    expect(merged.portrait).toEqual({ kind: 'builtin', id: 'a' })
  })

  it('卡上 portrait 为显式 null 时覆盖为 null（恢复默认头像也是卡上意图）', () => {
    const merged = applyCardToDraft(
      { characterName: '旧名', background: '', portrait: { kind: 'builtin', id: 'a' } },
      cardOf({ portrait: null }),
    )
    expect(merged.portrait).toBeNull()
  })
})

describe('buildJoinNewPayload（对照 Web create() 的字段清单）', () => {
  it('纯手填：只下发 join_as_new / character_name / background', () => {
    const payload = buildJoinNewPayload(
      { characterName: '  阿澈  ', background: '荒野猎人', portrait: undefined },
      null,
    )
    expect(payload).toEqual({ join_as_new: true, character_name: '阿澈', background: '荒野猎人' })
    expect('portrait' in payload).toBe(false)
  })

  it('手填头像随 payload 下发；显式 null 也保留（服务端收到 portrait: null = 恢复默认）', () => {
    const portrait: CharacterPortrait = { kind: 'generated', asset_id: 'gen1' }
    expect(
      buildJoinNewPayload({ characterName: '阿澈', background: '', portrait }, null).portrait,
    ).toEqual(portrait)
    expect(
      buildJoinNewPayload({ characterName: '阿澈', background: '', portrait: null }, null).portrait,
    ).toBeNull()
  })

  it('选卡：整卡 sheet 字段透传（含属性/技能），库级元数据剥离', () => {
    const payload = buildJoinNewPayload(
      { characterName: '莉拉', background: '卡上背景', portrait: undefined },
      cardOf({
        id: 'card-1',
        card_id: 'card-1',
        source: 'library',
        rule_id: 'dnd5e_core',
        rule_name: 'D&D 5e',
        ruleset_runtime: { capabilities: {} } as CharacterCard['ruleset_runtime'],
        character_name: '莉拉',
        background: '卡上背景',
        hp: 24,
        gold: 120,
        attributes: { str: 10, dex: 16 },
        skills: [{ name: '巧言', value: 5 }],
      }),
    )
    expect(payload.join_as_new).toBe(true)
    expect(payload.character_name).toBe('莉拉')
    expect(payload.background).toBe('卡上背景')
    expect(payload.hp).toBe(24)
    expect(payload.gold).toBe(120)
    expect(payload.attributes).toEqual({ str: 10, dex: 16 })
    expect(payload.skills).toEqual([{ name: '巧言', value: 5 }])
    // 库级元数据不透传
    expect('id' in payload).toBe(false)
    expect('card_id' in payload).toBe(false)
    expect('source' in payload).toBe(false)
    expect('rule_id' in payload).toBe(false)
    expect('rule_name' in payload).toBe(false)
    expect('ruleset_runtime' in payload).toBe(false)
  })

  it('选卡后用户改了姓名/背景：以草稿为准（卡上三项不回灌）', () => {
    const payload = buildJoinNewPayload(
      { characterName: '改名了', background: '改写了', portrait: { kind: 'builtin', id: 'b' } },
      cardOf({ background: '卡上背景', portrait: { kind: 'upload', asset_id: 'x' } }),
    )
    expect(payload.character_name).toBe('改名了')
    expect(payload.background).toBe('改写了')
    expect(payload.portrait).toEqual({ kind: 'builtin', id: 'b' })
  })
})

describe('joinFormReady（提交门槛对齐 Web：仅角色名非空）', () => {
  it('空串与纯空白不可提交', () => {
    expect(joinFormReady('')).toBe(false)
    expect(joinFormReady('   ')).toBe(false)
  })

  it('非空即可提交', () => {
    expect(joinFormReady('阿澈')).toBe(true)
    expect(joinFormReady(' 阿澈 ')).toBe(true)
  })
})
