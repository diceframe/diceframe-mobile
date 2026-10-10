import { describe, expect, it, vi } from 'vitest'

import type { CharacterCard } from '@/api/types'
import { orderLocalCardsForGame } from '@/features/join/orderLocalCards'
import { buildCardPatch, type CharacterCardForm } from '@/lib/character-card'
import { buildJoinNewPayload } from '@/lib/join-form'
import { joinCardFromDocument, newCardDocument, patchCardDocument, readCardV3, writeCardV3, type CardBody } from '@/lib/portable/card-v3'
import { canonicalJson } from '@/lib/portable/json'
import { editorSkillRows, localCardEdit, mergeEditedSkills, newLocalCardBody, type EditorSkillRow, type EditorSnapshot } from './card-edit'
import { withRuleCache } from './rule-cache'
import { createLatestGuard, createYielder } from './yielder'

const original = {
  schema_version: 2,
  character_name: 'Mira',
  race: '',
  class: '',
  background: '记者',
  gold: 25,
  rule_id: 'coc7',
  attributes: { str: 50, custom_luck: 7 },
  character_sheet: { hp: 10, homebrew: { x: 1 } },
  portrait: { kind: 'builtin', id: 'coc/1' },
  skills: [
    { name: '侦查', value: 60, effect: '找线索', base: 25, occupation: true },
    { name: '图书馆使用', value: 0, tags: ['knowledge'] },
    '闪避',
    { name: '', value: 5, note: 'blank name kept as stored' },
    { name: '格斗', value: 30, effect: { rich: 'object effect' } },
    { name: '格斗', value: 40, weapon: 'knife' },
  ],
  future_field: { keep: true },
} as unknown as CharacterCard

/** 模拟编辑器：打开表单（初值同 CharacterCardEditor），用户改动后保存 */
function openEditor(card: CharacterCard) {
  const state = {
    character_name: String(card.character_name ?? ''),
    race: String(card.race ?? ''),
    class: String(card.class ?? ''),
    background: String(card.background ?? ''),
    gold: undefined as number | undefined,
    skills: editorSkillRows(card.skills),
    portrait: card.portrait ?? null,
  }
  return {
    state,
    save() {
      const form: CharacterCardForm = {
        character_name: state.character_name,
        race: state.race,
        class: state.class,
        background: state.background,
        gold: state.gold ?? Number(card.gold ?? 0),
        skills: state.skills,
        portrait: state.portrait,
      }
      const snapshot: EditorSnapshot = { ...state, ...(state.gold === undefined ? {} : { gold: state.gold }) }
      const doc = writeCardV3(card as CardBody)
      const { patch, remove } = localCardEdit(card, buildCardPatch(form), snapshot)
      return { patch, remove, body: readCardV3(patchCardDocument(doc, patch, { remove })).body }
    },
  }
}

describe('本机卡编辑：只写用户改过的字段', () => {
  it('只改角色名：技能 / 出身 / 职业 / 金钱 / 头像的字节完全不变', () => {
    const editor = openEditor(original)
    editor.state.character_name = 'Mira K.'
    const { patch, remove, body } = editor.save()
    expect(patch).toEqual({ character_name: 'Mira K.' })
    expect(remove).toEqual([])
    for (const key of ['skills', 'race', 'class', 'gold', 'portrait', 'attributes', 'character_sheet', 'future_field'] as const) {
      expect(canonicalJson(body[key])).toBe(canonicalJson((original as Record<string, unknown>)[key]))
    }
  })

  it('改技能值时只动那一项：别的项（值 0、纯字符串、空名、对象 effect）原样保留', () => {
    const editor = openEditor(original)
    editor.state.skills = editor.state.skills.map((row) => (row.name === '侦查' ? { ...row, value: 65 } : row))
    const { body } = editor.save()
    expect(body.skills).toEqual([
      { name: '侦查', value: 65, effect: '找线索', base: 25, occupation: true },
      { name: '图书馆使用', value: 0, tags: ['knowledge'] },
      '闪避',
      { name: '', value: 5, note: 'blank name kept as stored' },
      { name: '格斗', value: 30, effect: { rich: 'object effect' } },
      { name: '格斗', value: 40, weapon: 'knife' },
    ])
  })

  it('改名的技能保留它自己的未知字段（按来源下标对回，而不是按名字）', () => {
    const editor = openEditor(original)
    editor.state.skills = editor.state.skills.map((row) => (row.name === '侦查' ? { ...row, name: '侦查（改）' } : row))
    const { body } = editor.save()
    expect((body.skills as unknown[])[0]).toEqual({ name: '侦查（改）', value: 60, effect: '找线索', base: 25, occupation: true })
  })

  it('两项同名技能调换顺序：各自的字段跟着各自走，不会互换', () => {
    const rows = editorSkillRows(original.skills)
    const [a, b] = [rows[4], rows[5]]
    const swapped: EditorSkillRow[] = [...rows.slice(0, 4), b, a]
    expect(mergeEditedSkills(original.skills, swapped)).toEqual([
      ...(original.skills as unknown[]).slice(0, 4),
      { name: '格斗', value: 40, weapon: 'knife' },
      { name: '格斗', value: 30, effect: { rich: 'object effect' } },
    ])
  })

  it('清空 effect 从那一项删掉；新增行按编辑器的值新建；删掉的行不再出现', () => {
    const rows = editorSkillRows(original.skills)
    const edited: EditorSkillRow[] = [{ ...rows[0], effect: '' }, { name: '新技能', value: 10, effect: '说明' }]
    expect(mergeEditedSkills(original.skills, edited)).toEqual([
      { name: '侦查', value: 60, base: 25, occupation: true },
      { name: '新技能', value: 10, effect: '说明' },
    ])
  })

  it('技能完全没动 → 补丁里没有 skills', () => {
    expect(mergeEditedSkills(original.skills, editorSkillRows(original.skills))).toBeNull()
  })

  it('金钱：没动输入框不写；动了才写', () => {
    const editor = openEditor(original)
    editor.state.gold = 40
    expect(editor.save().patch).toEqual({ gold: 40 })
  })

  it('清空头像走删除路径（不写 null）', () => {
    const editor = openEditor(original)
    editor.state.portrait = null
    const { patch, remove, body } = editor.save()
    expect(patch).toEqual({})
    expect(remove).toEqual([['portrait']])
    expect(body).not.toHaveProperty('portrait')
  })

  it('新建本机卡：清空的头像不写字段；可直接用于加入对局', () => {
    const form: CharacterCardForm = { character_name: 'Mira', race: '人类', class: '调查员', background: '记者', gold: 25, skills: [], portrait: null }
    const body = newLocalCardBody(buildCardPatch(form))
    expect(body).not.toHaveProperty('portrait')
    const doc = newCardDocument({ ...body, rule_id: 'coc7' })
    const payload = buildJoinNewPayload({ characterName: 'Mira', background: '记者', portrait: undefined }, joinCardFromDocument(doc))
    expect(payload).toMatchObject({ join_as_new: true, race: '人类', class: '调查员', gold: 25 })
  })
})

describe('加入页：本机卡按本局规则排序并标出不匹配', () => {
  it('规则一致的在前，不一致 / 没绑规则的标为不匹配；本局规则未知时不标', () => {
    const cards = [{ character_name: 'a', rule_id: 'dnd' }, { character_name: 'b', rule_id: 'coc7' }, { character_name: 'c' }] as CharacterCard[]
    expect(orderLocalCardsForGame(cards, 'coc7').map(({ card, matches }) => [card.character_name, matches])).toEqual([
      ['b', true], ['a', false], ['c', false],
    ])
    expect(orderLocalCardsForGame(cards, undefined).every((row) => row.matches)).toBe(true)
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

describe('让出 JS 线程与并发加载', () => {
  it('按时间预算让出：预算内不让，超过才让一次', async () => {
    let clock = 0
    const yieldOnce = vi.fn(async () => undefined)
    const maybeYield = createYielder(8, () => clock, yieldOnce)
    clock = 3
    await maybeYield()
    expect(yieldOnce).not.toHaveBeenCalled()
    clock = 9
    await maybeYield()
    expect(yieldOnce).toHaveBeenCalledTimes(1)
    clock = 12
    await maybeYield()
    expect(yieldOnce).toHaveBeenCalledTimes(1)
  })

  it('只认最后一次加载：先发后到的结果被丢弃', () => {
    const guard = createLatestGuard()
    const first = guard.begin()
    const second = guard.begin()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })
})
