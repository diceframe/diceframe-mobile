import { describe, expect, it, vi } from 'vitest'

import type { CharacterCard } from '@/api/types'
import { buildCardPatch, type CharacterCardForm } from '@/lib/character-card'
import { joinCardFromDocument, newCardDocument, patchCardDocument, readCardV3, writeCardV3, type CardBody } from '@/lib/portable/card-v3'
import { buildJoinNewPayload } from '@/lib/join-form'
import { localCardEdit, mergeEditedSkills, newLocalCardBody } from './card-edit'
import { withRuleCache } from './rule-cache'

const original = {
  schema_version: 2,
  character_name: 'Mira',
  race: '人类',
  class: '调查员',
  background: '记者',
  gold: 25,
  rule_id: 'coc7',
  attributes: { str: 50, custom_luck: 7 },
  character_sheet: { hp: 10, homebrew: { x: 1 } },
  portrait: { kind: 'builtin', id: 'coc/1' },
  skills: [
    { name: '侦查', value: 60, effect: '找线索', base: 25, occupation: true },
    { name: '图书馆使用', value: 50, tags: ['knowledge'] },
    '闪避',
  ],
  future_field: { keep: true },
} as unknown as CharacterCard

function form(overrides: Partial<CharacterCardForm> = {}): CharacterCardForm {
  return {
    character_name: 'Mira',
    race: '人类',
    class: '调查员',
    background: '记者',
    gold: 25,
    skills: [{ name: '侦查', value: 65 }, { name: '图书馆使用', value: 50 }],
    portrait: { kind: 'builtin', id: 'coc/1' },
    ...overrides,
  }
}

function applyEdit(editorForm: CharacterCardForm) {
  const doc = writeCardV3(original as CardBody)
  const { patch, remove } = localCardEdit(original, buildCardPatch(editorForm))
  return readCardV3(patchCardDocument(doc, patch, { remove })).body
}

describe('本机卡编辑：从存着的数组出发，不从表单重建', () => {
  it('技能按名字对回原项：保留未知字段，只改编辑器管的 name/value/effect；清空的 effect 被删除', () => {
    const body = applyEdit(form())
    expect(body.skills).toEqual([
      { name: '侦查', value: 65, base: 25, occupation: true },
      { name: '图书馆使用', value: 50, tags: ['knowledge'] },
    ])
  })

  it('调换顺序、改值、新增技能都对得上；被删掉的技能不再出现', () => {
    const merged = mergeEditedSkills(original.skills, [
      { name: '图书馆使用', value: 55 },
      { name: '新技能', value: 10, effect: '说明' },
      { name: '侦查', value: 60, effect: '找线索' },
    ])
    expect(merged).toEqual([
      { name: '图书馆使用', value: 55, tags: ['knowledge'] },
      { name: '新技能', value: 10, effect: '说明' },
      { name: '侦查', value: 60, effect: '找线索', base: 25, occupation: true },
    ])
  })

  it('编辑器不管的字段（属性、character_sheet、未知字段）原样保留', () => {
    const body = applyEdit(form({ race: '精灵' }))
    expect(body.race).toBe('精灵')
    expect(body.attributes).toEqual({ str: 50, custom_luck: 7 })
    expect(body.character_sheet).toEqual({ hp: 10, homebrew: { x: 1 } })
    expect(body.future_field).toEqual({ keep: true })
    expect(body.rule_id).toBe('coc7')
  })

  it('清空头像走删除路径（不写 null）', () => {
    const body = applyEdit(form({ portrait: null }))
    expect(body).not.toHaveProperty('portrait')
  })

  it('新建本机卡：清空的头像不写字段；可直接用于加入对局', () => {
    const body = newLocalCardBody(buildCardPatch(form({ portrait: null })))
    expect(body).not.toHaveProperty('portrait')
    const doc = newCardDocument({ ...body, rule_id: 'coc7' })
    const payload = buildJoinNewPayload({ characterName: 'Mira', background: '记者', portrait: undefined }, joinCardFromDocument(doc))
    expect(payload).toMatchObject({ join_as_new: true, race: '人类', class: '调查员', gold: 25 })
  })
})

describe('规则缓存策略', () => {
  it('在线：取服务器最新并写回缓存', async () => {
    const write = vi.fn()
    await expect(withRuleCache({ fetch: async () => 'fresh', read: () => 'old', write })).resolves.toEqual({ value: 'fresh', fromCache: false })
    expect(write).toHaveBeenCalledWith('fresh')
  })

  it('离线：用缓存；没有缓存就把原错误抛出；缓存写失败不影响在线结果', async () => {
    const offline = new Error('Network request failed')
    await expect(withRuleCache({ fetch: async () => { throw offline }, read: () => 'old', write: vi.fn() })).resolves.toEqual({ value: 'old', fromCache: true })
    await expect(withRuleCache({ fetch: async () => { throw offline }, read: () => null, write: vi.fn() })).rejects.toBe(offline)
    await expect(withRuleCache({ fetch: async () => 'v', read: () => null, write: () => { throw new Error('disk') } })).resolves.toEqual({ value: 'v', fromCache: false })
  })
})
