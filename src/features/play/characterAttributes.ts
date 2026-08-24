import type { RuleAttribute } from '@/api/types'

export interface CharacterAttributeRow {
  key: string
  label: string
  value: string
}

const FALLBACK_ATTRIBUTE_NAMES: Record<string, string> = {
  str: '力量',
  con: '体质',
  dex: '敏捷',
  int: '智力',
  edu: '教育',
  app: '外貌',
  pow: '意志',
  siz: '体型',
  wis: '感知',
  cha: '魅力',
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attributeLabel(attribute: RuleAttribute): string {
  const localizedName = text(attribute.name)
  if (localizedName) return localizedName

  const displayName = text(attribute.display_name)
  if (displayName) {
    const canonicalSuffix = new RegExp(
      `\\s*[（(]\\s*${escapeRegExp(attribute.key)}\\s*[)）]\\s*$`,
      'i',
    )
    return displayName.replace(canonicalSuffix, '').trim() || displayName
  }

  return FALLBACK_ATTRIBUTE_NAMES[attribute.key.toLowerCase()] ?? attribute.key.toUpperCase()
}

function attributeValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    for (const key of ['value', 'current', 'score']) {
      if (key in source) return attributeValue(source[key])
    }
  }
  return '—'
}

/**
 * 保持 canonical key 作为 identity，只把本地化名称用于显示。
 * 规则顺序优先，同时保留旧存档里的额外属性。
 */
export function characterAttributeRows(
  attributes: Record<string, unknown> | undefined,
  ruleAttributes: RuleAttribute[],
): CharacterAttributeRow[] {
  if (!attributes) return []

  const metadata = new Map(ruleAttributes.map((attribute) => [attribute.key, attribute]))
  const orderedKeys = ruleAttributes
    .map((attribute) => attribute.key)
    .filter((key) => Object.prototype.hasOwnProperty.call(attributes, key))
  orderedKeys.push(...Object.keys(attributes).filter((key) => !metadata.has(key)))

  return orderedKeys.map((key) => ({
    key,
    label: metadata.has(key)
      ? attributeLabel(metadata.get(key)!)
      : FALLBACK_ATTRIBUTE_NAMES[key.toLowerCase()] ?? key.toUpperCase(),
    value: attributeValue(attributes[key]),
  }))
}
