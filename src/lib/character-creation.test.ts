import { describe, expect, it } from 'vitest'

import { buildCardPatch } from './character-card'
import {
  characterCreationIssue,
  creationAttributeBudget,
  creationSkillValue,
  evalRuleFormula,
  skillBaseValue,
  skillBudget,
  suggestedCreationAttributes,
  type CreationSchema,
} from './character-creation'

// v3.3.3 freeform_coc /character-schema 投影；客户端不硬编码这些限制。
const schema = {
  rule_attrs: ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'].map((key) => ({
    key, min: ['siz', 'int', 'edu'].includes(key) ? 40 : 15, max: 90,
  })),
  rule_attrs_total: 460,
  rule_meta: {
    mechanics: 'coc7e_core',
    skill_point_spend_mode: 'above_base', skill_point_total: 320,
    skill_point_formula: 'edu * 4 + int * 2', max_skills: 12, max_skill_value: 85,
    skill_base_values: { 侦查: 25 },
    skill_base_lookup: {
      'Spot Hidden': { base: 25 },
      Dodge: { base: 25, formula: 'dex // 2' },
      dodge: { base: 25, formula: 'dex // 2' },
      'Own Language': { base: 50, formula: 'edu' },
      'Pool Skill': { base: 0 },
    },
    custom_skill_base: 5,
  },
} satisfies CreationSchema
const meta = schema.rule_meta
const attributes = { str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 50, edu: 50 }

describe('规则属性公式（服务端 DSL）', () => {
  it('按优先级计算，并在各步骤按服务端的 / 与 // 语义取整', () => {
    expect(evalRuleFormula('edu * 4 + int * 2', { edu: 80, int: 60 })).toBe(440)
    expect(evalRuleFormula('dex // 2', { dex: 55 })).toBe(27)
    expect(evalRuleFormula('(-5 // +2) + (5 / 2) * 3', {})).toBe(3)
    expect(evalRuleFormula('max((con + siz) // 10, 1)', attributes)).toBe(10)
    expect(evalRuleFormula('min(7, abs(-8), int(6.5))', {})).toBe(6)
    expect(evalRuleFormula('int + missing', { int: 50 })).toBe(50)
  })

  it.each(['edu ** 2', 'edu.constructor', 'edu; 5', 'unknown(edu)', '13 / 0', 'abs(1, 2)', '1 2', '1+', '(()', '9'.repeat(1025)])('不解释公式 %s', (formula) => {
    expect(evalRuleFormula(formula, attributes)).toBeNull()
  })
})

describe('CoC 建卡技能点', () => {
  it('属性重算合计预算；无属性与无法计算时回退静态总额', () => {
    expect(skillBudget([], meta, { ...attributes, edu: 80, int: 60 }).total).toBe(440)
    expect(skillBudget([], meta, attributes).total).toBe(300)
    expect(skillBudget([], meta, {}).total).toBe(320)
    expect(skillBudget([], { ...meta, skill_point_formula: '1 / 0' }, attributes).total).toBe(320)
  })

  it('采用规则投影中的 id、当前语言名、规范名和自定义技能基础值', () => {
    const attrs = { ...attributes, dex: 55, edu: 80 }
    expect(['Dodge', 'dodge', 'Own Language', '侦查', 'Spot Hidden', 'Pool Skill', '新技能']
      .map((name) => skillBaseValue(name, meta, attrs))).toEqual([27, 27, 80, 25, 25, 0, 5])
    expect(skillBaseValue('Dodge', meta)).toBe(25)
    expect(skillBaseValue('Dodge', { ...meta, skill_base_lookup: { Dodge: { base: 25, formula: 'dex / 0' } } }, attrs)).toBe(25)
  })

  it('只收超过基础值的部分，低于基础值不返还点数；非点购规则仍按技能数值计点', () => {
    const skills = [
      { name: 'Dodge', value: 50 }, { name: 'Own Language', value: 45 },
      { name: 'Spot Hidden', value: 60 }, { name: '自订', value: 10 }, { name: ' ', value: 90 },
    ]
    expect(skillBudget(skills, meta, { ...attributes, dex: 70 }).spent).toBe(55)
    expect(skillBudget(skills, { ...meta, skill_point_spend_mode: 'total_value' }, attributes).spent).toBe(165)
  })

  it('未填技能值随属性取缺省（包括旧式字符串），不会把显式零改写成基础值', () => {
    const skills = [{ name: 'Dodge' }, { name: 'Own Language' }, { name: 'Pool Skill', value: 0 }, { name: 'Spot Hidden', value: 0 }]
    const attrs = { ...attributes, dex: 55, edu: 90 }
    expect(skillBaseValue('Own Language', meta, attrs)).toBe(90)
    expect(creationSkillValue(skills[1], meta, attrs)).toBe(85)
    expect(buildCardPatch({ character_name: 'Mira', race: '', class: '', background: '', gold: 0, portrait: null,
      skills, attributes: attrs,
    }, meta)).toMatchObject({ attributes: attrs, skills: [
      { name: 'Dodge', value: 27 }, { name: 'Own Language', value: 85 }, { name: 'Pool Skill', value: 0 }, { name: 'Spot Hidden', value: 0 },
    ] })
    expect(skillBudget(['Dodge', 'Own Language', '自订'], meta, attrs)).toMatchObject({ count: 3, spent: 0, outOfRange: false })
  })

  it('合计不必花光，但预算、数量或单项超限各自可识别', () => {
    const atBudget = Array.from({ length: 4 }, (_, i) => ({ name: `自订${i}`, value: 80 }))
    expect(skillBudget(atBudget, meta, attributes)).toMatchObject({ total: 300, spent: 300, overspent: false })
    expect(skillBudget([...atBudget, { name: 'Dodge', value: 26 }], meta, attributes)).toMatchObject({ spent: 301, overspent: true })
    expect(skillBudget(Array.from({ length: 13 }, (_, i) => `自订${i}`), meta, attributes).tooMany).toBe(true)
    expect(skillBudget([{ name: 'Own Language', value: 86 }], meta, { ...attributes, edu: 90 }).outOfRange).toBe(true)
    expect(skillBudget([{ name: 'Dodge', value: 2.5 }], meta, attributes).outOfRange).toBe(true)
  })
})

describe('完整 CoC 建卡预检', () => {
  it('建议属性只在声明的键分配，不超限；未花完属性点也能入场', () => {
    const draft = suggestedCreationAttributes(schema)
    expect(creationAttributeBudget(schema, draft)).toEqual({ complete: true, sum: 460, total: 460, outOfRange: false, overspent: false })
    expect(creationAttributeBudget(schema, { ...attributes, other: 999 }).sum).toBe(400)
    expect(characterCreationIssue(schema, { attributes, skills: [{ name: '侦查', value: 70 }] })).toBeNull()
  })

  it('拒绝完整草稿的缺项、属性总额或单项超限，以及技能超限', () => {
    expect(characterCreationIssue(schema, { attributes: { edu: 50 } }, true)).toBe('dfCharacterCreationAttributesInvalid')
    expect(characterCreationIssue(schema, { attributes: { ...attributes, edu: 39 } })).toBe('dfCharacterCreationAttributesInvalid')
    expect(characterCreationIssue(schema, { attributes: { ...attributes, edu: 90, int: 90 } })).toBe('dfCharacterCreationAttributesInvalid')
    expect(characterCreationIssue(schema, { attributes, skills: [{ name: 'Dodge', value: 86 }] })).toBe('dfCharacterCreationSkillsInvalid')
  })

  it('不把轻量加入、合法旧式部分卡或其它规则强制当成完整 CoC 建卡', () => {
    const skills = Array.from({ length: 13 }, (_, i) => ({ name: `自订${i}`, value: 90 }))
    expect(characterCreationIssue(schema, { attributes: { edu: 50 }, skills })).toBeNull()
    expect(characterCreationIssue(schema, {})).toBeNull()
    expect(characterCreationIssue({ ...schema, rule_meta: { ...meta, mechanics: 'freeform_d20_core' } }, { attributes, skills })).toBeNull()
  })
})
