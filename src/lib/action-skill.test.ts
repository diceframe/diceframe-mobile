import { describe, expect, it } from 'vitest'

import type { CharacterSheet } from '@/api/types'

import { actionSkillNames, reconcileActionSkill } from './action-skill'

const sheet = { skills: ['侦查', { name: '图书馆使用', value: 40 }, '侦查', '', { name: 'x'.repeat(129) }] } as CharacterSheet

describe('行动技能', () => {
  it('技能名去重、去空、去超长，保持顺序', () => {
    expect(actionSkillNames(sheet)).toEqual(['侦查', '图书馆使用'])
    expect(actionSkillNames(null)).toEqual([])
  })

  it('卡上没有该技能时清空；卡未加载时保留', () => {
    expect(reconcileActionSkill('侦查', sheet)).toBe('侦查')
    expect(reconcileActionSkill('潜行', sheet)).toBe('')
    expect(reconcileActionSkill('潜行', null)).toBe('潜行')
  })
})
