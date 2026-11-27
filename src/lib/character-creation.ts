import type { CharacterSchemaResponse, CharacterSheet, CharacterSkill, RuleAttribute, RuleMeta } from '@/api/types'

/** DSL 的算术子集；模板来自服务器或插件，不能执行脚本。向服务端一样逐步取整。 */
export function evalRuleFormula(formula: string | undefined, attributes: Record<string, number>): number | null {
  if (!formula || formula.length > 1024) return null
  const tokens = formula.match(/\d+(?:\.\d+)?|[a-zA-Z_]\w*|\/\/|[-+*/(),]|[^\s]/g) ?? []
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const fail = (): never => { throw new Error('Invalid rule formula') }
  function integer(n: number) {
    const value = Math.trunc(n) || 0
    if (!Number.isFinite(n) || !Number.isSafeInteger(value)) return fail()
    return value
  }
  function primary(): number {
    const token = next()
    if (token === '+' || token === '-') return integer((token === '-' ? -1 : 1) * primary())
    if (token === '(') {
      const value = expression()
      if (next() !== ')') return fail()
      return value
    }
    if (/^\d+(?:\.\d+)?$/.test(token ?? '')) return integer(Number(token))
    if (!token || !/^[a-zA-Z_]\w*$/.test(token)) return fail()
    if (peek() !== '(') {
      const value = Object.hasOwn(attributes, token) ? attributes[token] : 0
      return integer(value)
    }
    next()
    const args = [expression()]
    while (peek() === ',') {
      next()
      args.push(expression())
    }
    if (next() !== ')') return fail()
    if (token === 'min' && args.length > 1) return Math.min(...args)
    if (token === 'max' && args.length > 1) return Math.max(...args)
    if (token === 'abs' && args.length === 1) return Math.abs(args[0])
    if (token === 'int' && args.length === 1) return args[0]
    return fail()
  }
  function term() {
    let value = primary()
    while (peek() === '*' || peek() === '/' || peek() === '//') {
      const op = next()
      const right = primary()
      value = integer(op === '*' ? value * right : op === '//' ? Math.floor(value / right) : value / right)
    }
    return value
  }
  function expression() {
    let value = term()
    while (peek() === '+' || peek() === '-') {
      const op = next()
      const right = term()
      value = integer(op === '+' ? value + right : value - right)
    }
    return value
  }
  try {
    const result = expression()
    return pos === tokens.length ? result : null
  } catch {
    return null
  }
}

export type CreationSchema = Pick<CharacterSchemaResponse, 'rule_attrs' | 'rule_attrs_total' | 'rule_meta' | 'skill_pool'>
type Attributes = NonNullable<CharacterSheet['attributes']>

export function usesAboveBase(meta: RuleMeta | null | undefined): boolean {
  return meta?.skill_point_spend_mode === 'above_base'
}

export function usesCreationAttributes(schema: CreationSchema | null | undefined): schema is CreationSchema & { rule_attrs: RuleAttribute[] } {
  return !!schema?.rule_attrs?.length && usesAboveBase(schema.rule_meta)
}

function derive(formula: string | undefined, attributes: Attributes | undefined) {
  // 部分旧卡依旧合法；没有属性数据时显示规则给的静态缺省。
  return attributes && Object.keys(attributes).length ? evalRuleFormula(formula, attributes) : null
}

export function skillBaseValue(name: string, meta?: RuleMeta | null, attributes?: Attributes): number {
  const key = name.trim()
  const lookup = meta?.skill_base_lookup
  // 入场按技能 id / 规范名 / 当前语言显示名精确匹配；不替用户改写技能名。
  if (lookup && Object.hasOwn(lookup, key)) {
    const entry = lookup[key]
    const value = derive(entry.formula, attributes)
    return value === null ? entry.base : Math.max(0, Math.min(value, 99))
  }
  const legacy = meta?.skill_base_values
  return legacy && Object.hasOwn(legacy, key) ? legacy[key] : meta?.custom_skill_base ?? 0
}

export function creationSkillValue(skill: CharacterSkill, meta?: RuleMeta | null, attributes?: Attributes): number {
  // 显式 0 与没填不同。默认值随属性变化，但已填的数值绝不自动改写。
  if (skill.value != null) {
    const value = Number(skill.value)
    if (Number.isFinite(value)) return value
  }
  if (!usesAboveBase(meta)) return 20
  const base = skillBaseValue(skill.name, meta, attributes)
  return meta?.max_skill_value ? Math.min(base, meta.max_skill_value) : base
}

export function skillBudget(skills: readonly (string | CharacterSkill)[], meta?: RuleMeta | null, attributes?: Attributes) {
  const derived = derive(meta?.skill_point_formula, attributes)
  const total = derived === null ? meta?.skill_point_total ?? 0 : Math.max(0, derived)
  const maxSkills = meta?.max_skills ?? 0
  const maxValue = meta?.max_skill_value ?? 0
  const filled = (Array.isArray(skills) ? skills : []).flatMap((skill) => {
    const row = typeof skill === 'string' ? { name: skill } : skill
    return typeof row?.name === 'string' && row.name.trim() ? [row] : []
  })
  const spent = filled.reduce((sum, row) => {
    const value = creationSkillValue(row, meta, attributes)
    return sum + (usesAboveBase(meta) ? Math.max(0, value - skillBaseValue(row.name, meta, attributes)) : value)
  }, 0)
  const tooMany = maxSkills > 0 && filled.length > maxSkills
  const overspent = total > 0 && spent > total
  const outOfRange = filled.some((row) => {
    const value = creationSkillValue(row, meta, attributes)
    return !Number.isSafeInteger(value) || value < 0 || (maxValue > 0 && value > maxValue)
  })
  return { total, spent, count: filled.length, maxSkills, maxValue, tooMany, overspent, outOfRange }
}

function attributeLimit(schema: CreationSchema) {
  return schema.rule_attrs_total ?? schema.rule_meta?.attribute_points
}

/** 先均分，再按规则声明顺序补余点；不会超出各项上下限。 */
export function suggestedCreationAttributes(schema: CreationSchema): Attributes {
  const specs = schema.rule_attrs ?? []
  const min = specs.reduce((sum, attr) => sum + attr.min, 0)
  const max = specs.reduce((sum, attr) => sum + attr.max, 0)
  let remaining = Math.max(0, Math.min(Math.trunc(attributeLimit(schema) ?? (min + max) / 2), max) - min)
  const values = specs.map((attr) => attr.min)
  while (remaining > 0) {
    const eligible = specs.flatMap((attr, i) => values[i] < attr.max ? [i] : [])
    if (!eligible.length) break
    const share = Math.max(1, Math.floor(remaining / eligible.length))
    for (const i of eligible) {
      const add = Math.min(share, specs[i].max - values[i], remaining)
      values[i] += add
      remaining -= add
    }
  }
  return Object.fromEntries(specs.map((attr, i) => [attr.key, values[i]]))
}

export function creationAttributeBudget(schema: CreationSchema, attributes: Attributes) {
  const specs = schema.rule_attrs ?? []
  const total = attributeLimit(schema)
  const sum = specs.reduce((value, attr) => value + (attributes[attr.key] ?? 0), 0)
  const complete = specs.every((attr) => Object.hasOwn(attributes, attr.key))
  const outOfRange = specs.some(({ key, min, max }) => {
    const value = attributes[key]
    return value !== undefined && (!Number.isSafeInteger(value) || value < min || value > max)
  })
  return { complete, sum, total, outOfRange, overspent: total !== undefined && sum > total }
}

/** 开卡预检，不代替服务端（装备、权限、派生资源均由服务端处理）。旧式部分卡仍可原样入局。 */
export function characterCreationIssue(
  schema: CreationSchema | null | undefined,
  sheet: Pick<CharacterSheet, 'attributes' | 'skills'>,
  requireComplete = false,
) {
  // schema 不暴露 clamp_to_rule_bounds；不要把 CoC 的硬门槛套到其它插件的点购表单。
  if (!usesCreationAttributes(schema) || schema.rule_meta?.mechanics !== 'coc7e_core') return null
  const attrs = creationAttributeBudget(schema, sheet.attributes ?? {})
  if (!attrs.complete && !requireComplete) return null
  if (!attrs.complete || attrs.outOfRange || attrs.overspent) return 'dfCharacterCreationAttributesInvalid'
  const skills = skillBudget(sheet.skills ?? [], schema.rule_meta, sheet.attributes)
  if (skills.tooMany || skills.overspent || skills.outOfRange) return 'dfCharacterCreationSkillsInvalid'
  return null
}
