/**
 * 内置头像目录（纯逻辑，与 Web 端 utils/portraits.ts 保持同一套 id 与文件映射）。
 * 静态 URL 的拼装在 api/assets.ts，本文件只负责规则归一化与 id/路径推导。
 */

export const BUILTIN_AVATAR_RULE_IDS = [
  'dnd5e',
  'freeform_coc',
  'freeform_cyberpunk',
  'freeform_fantasy',
  'freeform_wuxia',
  'tavern_free',
] as const

export type BuiltinAvatarRuleId = (typeof BUILTIN_AVATAR_RULE_IDS)[number]

/** 每条规则 8 张：前 4 实拍、后 4 动漫（文件名与 Web 端一致） */
export const PORTRAIT_COUNT_PER_RULE = 8

const PORTRAIT_FILES = [
  'realistic-1.jpg',
  'realistic-2.jpg',
  'realistic-3.jpg',
  'realistic-4.jpg',
  'anime-1.jpg',
  'anime-2.jpg',
  'anime-3.jpg',
  'anime-4.jpg',
] as const

/** 归一化规则 id：剥离 _en 语言后缀；未知规则回退 freeform_fantasy（同 Web builtinRule） */
export function builtinRuleId(ruleId?: string | null): BuiltinAvatarRuleId {
  const normalized = String(ruleId || '').trim().replace(/_en$/, '')
  return (BUILTIN_AVATAR_RULE_IDS as readonly string[]).includes(normalized)
    ? (normalized as BuiltinAvatarRuleId)
    : 'freeform_fantasy'
}

export interface BuiltinPortraitChoice {
  /** 服务端 portrait id：`${rule}:${index}` */
  id: string
  ruleId: BuiltinAvatarRuleId
  index: number
  /** /v2-assets 下的静态路径 */
  assetPath: string
}

export function builtinPortraitChoices(ruleId?: string | null): BuiltinPortraitChoice[] {
  const rule = builtinRuleId(ruleId)
  return PORTRAIT_FILES.map((file, index) => ({
    id: `${rule}:${index}`,
    ruleId: rule,
    index,
    assetPath: `/avatars/v3/${rule}/${file}`,
  }))
}

/**
 * portrait id（`${rule}:${index}`）→ 静态资源路径；规则段容忍 _en 后缀
 * （历史数据可能存 dnd5e_en:0），规则未知或下标越界返回 null。
 */
export function builtinPortraitAssetPath(portraitId?: string | null): string | null {
  const [rawRule, rawIndex] = String(portraitId || '').split(':')
  const stripped = String(rawRule || '').replace(/_en$/, '')
  if (!(BUILTIN_AVATAR_RULE_IDS as readonly string[]).includes(stripped)) return null
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0 || index >= PORTRAIT_COUNT_PER_RULE) return null
  return `/avatars/v3/${stripped}/${PORTRAIT_FILES[index]}`
}
