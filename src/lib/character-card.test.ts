import { describe, expect, it } from 'vitest'

import { buildCardPatch, normalizeSkillList, skillPoolNames } from './character-card'

describe('character card patch normalization', () => {
  it('upgrades legacy string skills with the default value', () => {
    expect(normalizeSkillList(['攀爬', { name: '侦查', value: 60 }])).toEqual([
      { name: '攀爬', value: 20 },
      { name: '侦查', value: 60 },
    ])
    expect(normalizeSkillList(undefined)).toEqual([])
  })

  it('keeps only named skills and parses numeric fields like the web save path', () => {
    const patch = buildCardPatch({
      character_name: '  莱拉  ',
      race: '  ',
      class: '',
      background: '  流浪剑客  ',
      gold: '42.9',
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

  it('falls back to the unnamed card title when the name is blank', () => {
    expect(buildCardPatch({
      character_name: '   ',
      race: '',
      class: '',
      background: '',
      gold: '',
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
