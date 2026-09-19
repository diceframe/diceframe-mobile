/**
 * 职业能力与职业资源的读取（服务端投影，只读）。
 *
 * `class_features` / `class_resources` 由服务端按当前职业与等级投影下来：
 * 身份、可用性与派生数值全在服务端。客户端**绝不**自己判断职业等级、算武艺骰
 * 或算资源上限，只渲染拿到的 name / summary / current / maximum——上游把这条
 * 写成了明确的运行时边界（docs/dnd2024 class feature runtime boundary）。
 *
 * 老存档没有这两个字段（服务端只对支持的规则投影），此时对应分区不展示。
 */
import type { CharacterClassFeature, CharacterClassResource, CharacterSheet } from '@/api/types'

export function classFeatureList(sheet?: CharacterSheet | null): CharacterClassFeature[] {
  return Array.isArray(sheet?.class_features) ? sheet.class_features : []
}

/**
 * 可展示的职业资源：上限为 0 的行不显示。
 * 服务端会把"这个职业有但当前等级还拿不到"的资源投影成 maximum=0，
 * 画成一条空进度条只会让人以为资源被用光了。
 */
export function classResourceRows(sheet?: CharacterSheet | null): CharacterClassResource[] {
  const rows = Array.isArray(sheet?.class_resources) ? sheet.class_resources : []
  return rows.filter((row) => Number(row?.maximum) > 0)
}

/** 进度条百分比，钳到 0–100：current 超过 maximum 时按满格，不画出界。 */
export function classResourcePercent(resource: CharacterClassResource): number {
  const maximum = Number(resource?.maximum ?? 0)
  if (!(maximum > 0)) return 0
  const current = Number(resource?.current ?? 0)
  return Math.min(100, Math.max(0, (current / maximum) * 100))
}
