import { describe, expect, it } from 'vitest'

import {
  buildCardPatch,
  normalizeSkillList,
  skillPoolNames,
  SKILL_EFFECT_MAX_CHARS,
} from './character-card'

describe('character card patch normalization', () => {
  it('upgrades legacy string skills with the default value', () => {
    expect(normalizeSkillList(['攀爬', { name: '侦查', value: 60 }])).toEqual([
      { name: '攀爬', value: 20 },
      { name: '侦查', value: 60 },
    ])
    expect(normalizeSkillList(undefined)).toEqual([])
  })

  it('keeps only named skills and normalizes numeric fields like the web save path', () => {
    const patch = buildCardPatch({
      character_name: '  莱拉  ',
      race: '  ',
      class: '',
      background: '  流浪剑客  ',
      gold: 42.4,
      skills: [
        { name: '  剑术 ', value: 55 },
        { name: '   ', value: 90 },
        { name: '攀爬', value: Number.NaN },
      ],
      portrait: null,
    })
    expect(patch).toMatchObject({
      character_name: '莱拉',
      race: '人类',
      class: '冒险者',
      background: '流浪剑客',
      gold: 42,
      skills: [
        { name: '剑术', value: 55 },
        { name: '攀爬', value: 0 },
      ],
      portrait: null,
    })
  })

  it('保留技能的可选效果说明：去空白、超长按服务端上限截断、空说明不写字段', () => {
    const long = 'x'.repeat(SKILL_EFFECT_MAX_CHARS + 20)
    expect(normalizeSkillList([
      { name: '侦查', value: 60, effect: '  盯住细节  ' },
      { name: '攀爬', value: 40, effect: '   ' },
      { name: '话术', value: 30, effect: long },
    ])).toEqual([
      { name: '侦查', value: 60, effect: '盯住细节' },
      { name: '攀爬', value: 40 },
      { name: '话术', value: 30, effect: 'x'.repeat(SKILL_EFFECT_MAX_CHARS) },
    ])
  })

  it('效果说明随补丁一起提交，清空即移除该字段', () => {
    expect(buildCardPatch({
      character_name: '莱拉',
      race: '',
      class: '',
      background: '',
      gold: 0,
      skills: [
        { name: '剑术', value: 55, effect: ' 双手持握时更稳 ' },
        { name: '潜行', value: 40, effect: '' },
      ],
      portrait: null,
    }).skills).toEqual([
      { name: '剑术', value: 55, effect: '双手持握时更稳' },
      { name: '潜行', value: 40 },
    ])
  })

  it('falls back to the unnamed card title when the name is blank', () => {
    expect(buildCardPatch({
      character_name: '   ',
      race: '',
      class: '',
      background: '',
      gold: 0,
      skills: [],
      portrait: null,
    }).character_name).toBe('未命名')
  })
})

describe('skill pool names', () => {
  it('flattens string and spec pool entries', () => {
    expect(skillPoolNames(['攀爬', { name: '侦查' }, { key: 'listen' }, { name: '' }])).toEqual([
      '攀爬',
      '侦查',
      'listen',
    ])
  })
})
