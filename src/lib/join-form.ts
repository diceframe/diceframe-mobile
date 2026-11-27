/**
 * 玩家加入建卡的选卡合并与 payload 组装（对齐 Web JoinView 的语义）。
 *
 * Web 端「从共享卡库选卡」= applyCard 把整卡 JSON 拷进表单（{...form, ...copied}，
 * 卡值覆盖同名手填字段），之后仍可手改；提交 = 表单全量展开 + join_as_new: true。
 * 默认走轻量加入；规则提供建卡预算时可另填属性和技能。卡库字段默认透传，
 * 显式调整属性/技能时才覆盖这两项，不改动人物身份、装备或规则蓝图。
 */
import type { CharacterCard, CharacterPortrait, CharacterSheet } from '@/api/types'
import { suggestedCreationAttributes, type CreationSchema } from '@/lib/character-creation'
import { editorSkillRows, mergeEditedSkills, type EditorSkillRow } from '@/lib/local-library/card-edit'

/** Web 背景输入框 maxlength（JoinView 的 backgroundLimit） */
export const JOIN_BACKGROUND_LIMIT = 8000

/** Web 姓名输入框 maxlength（JoinView 的 maxlength="40"） */
export const JOIN_NAME_LIMIT = 40

/** 移动端手填草稿；portrait 为 undefined 表示「未设置」（序列化时同 Web 一样不下发该键） */
export interface JoinCharacterDraft {
  characterName: string
  background: string
  portrait: CharacterPortrait | null | undefined
}

/**
 * 卡片里的库级元数据不进 join payload：/players 建卡只消费 sheet 字段，
 * 这些键 Web 虽全量透传但服务端会忽略，移动端收窄避免脏数据入库。
 * character_name/background/portrait 三项由手填草稿接管（选卡时已拷入草稿，
 * 用户选后可改，提交以草稿为准才不丢改动）。
 */
const CARD_META_KEYS = new Set([
  'id',
  'card_id',
  'source',
  'schema_version',
  'rule_id',
  'rule_name',
  'rule_version',
  'mechanics',
  'language',
  'active_locale',
  'ruleset_runtime',
  'ruleset_revision',
  'character_name',
  'background',
  'portrait',
])

/** 选卡合并进草稿：卡值覆盖同名手填（对齐 Web applyCard 的 {...form, ...copied} 展开顺序） */
export function applyCardToDraft(draft: JoinCharacterDraft, card: CharacterCard): JoinCharacterDraft {
  return {
    characterName: String(card.character_name ?? draft.characterName),
    background: card.background !== undefined ? String(card.background) : draft.background,
    portrait: card.portrait !== undefined ? (card.portrait ?? null) : draft.portrait,
  }
}

export interface JoinCreationDraft {
  attributes: Record<string, number>
  skills: EditorSkillRow[]
}

export function beginJoinCreation(schema: CreationSchema, card: CharacterCard | null): JoinCreationDraft {
  return {
    attributes: { ...suggestedCreationAttributes(schema), ...card?.attributes },
    skills: editorSkillRows(card?.skills),
  }
}

export interface JoinNewPayload extends Pick<CharacterSheet, 'attributes' | 'skills'> {
  join_as_new: true
  character_name: string
  /** Web 表单恒有 background 键（空串也下发），此处保持一致 */
  background: string
  portrait?: CharacterPortrait | null
  [key: string]: unknown
}

/**
 * 组装 POST /games/{key}/players 的建卡 payload（join_as_new 分支）。
 * 字段对照 Web create()：表单全量 + join_as_new。未打开详细建卡时保留原卡或轻量请求。
 * portrait 为 undefined 时不下发，显式 null 保留 = 恢复默认头像。
 */
export function buildJoinNewPayload(
  draft: JoinCharacterDraft,
  card: CharacterCard | null,
  creation?: JoinCreationDraft | null,
): JoinNewPayload {
  const cardSheetFields: Record<string, unknown> = {}
  if (card) {
    for (const [key, value] of Object.entries(card)) {
      if (!CARD_META_KEYS.has(key) && value !== undefined) cardSheetFields[key] = value
    }
  }
  const payload: JoinNewPayload = {
    join_as_new: true,
    ...cardSheetFields,
    character_name: draft.characterName.trim(),
    background: draft.background,
  }
  if (creation) {
    payload.attributes = creation.attributes
    const skills = mergeEditedSkills(card?.skills, creation.skills)
    payload.skills = (skills as CharacterSheet['skills']) ?? card?.skills ?? []
  }
  if (draft.portrait !== undefined) payload.portrait = draft.portrait
  return payload
}

/** 提交门槛与 Web 一致：只要求角色名非空（选卡会把卡名拷入草稿，因此选卡后天然可提交） */
export function joinFormReady(characterName: string): boolean {
  return characterName.trim().length > 0
}
