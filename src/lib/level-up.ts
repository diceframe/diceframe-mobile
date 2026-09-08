import type { CharacterSheet, RuleAttribute } from '@/api/types'

/** 只开放规则声明且角色已有数值的属性，不为缺失属性猜测初始值或上限。 */
export function levelUpAttributes(sheet: CharacterSheet | null, rules: RuleAttribute[]): RuleAttribute[] {
  return rules.filter((rule) => {
    const value = sheet?.attributes?.[rule.key]
    return Number.isSafeInteger(value)
      && Number.isSafeInteger(rule.min)
      && Number.isSafeInteger(rule.max)
      && rule.min <= rule.max
  })
}

export function levelUpPoints(sheet: CharacterSheet | null): number {
  const points = sheet?.level_up_points
  return typeof points === 'number' && Number.isSafeInteger(points) && points > 0 ? points : 0
}

/** 草稿只记增量；提交时以最新角色校验，保留规则未列出的其它属性。 */
export function buildLevelUpAttributes(
  sheet: CharacterSheet | null,
  rules: RuleAttribute[],
  additions: Record<string, number>,
): Record<string, number> | null {
  const available = levelUpPoints(sheet)
  if (!available || !sheet?.attributes) return null
  const definitions = new Map(levelUpAttributes(sheet, rules).map((rule) => [rule.key, rule]))
  const attributes = { ...sheet.attributes }
  let spent = 0
  for (const [key, amount] of Object.entries(additions)) {
    const rule = definitions.get(key)
    if (!rule || !Number.isSafeInteger(amount) || amount < 0) return null
    if (amount === 0) continue
    const next = attributes[key] + amount
    if (!Number.isSafeInteger(next) || next < rule.min || next > rule.max) return null
    spent += amount
    if (spent > available) return null
    attributes[key] = next
  }
  return spent > 0 ? attributes : null
}
