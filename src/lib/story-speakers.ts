/**
 * 剧情说话人名册（GM 立绘管理）的纯逻辑，对齐上游 story/StoryPortraits.vue。
 *
 * GET  /games/{key}/story-speakers                    → { ok, speakers: [{id,name,portrait,first_round,last_round}] }
 * PUT  /games/{key}/story-speakers/{id}/portrait      { portrait }
 * POST /games/{key}/story-speakers/merge              { source_id, target_id }
 *
 * s_ 开头是席位角色，g_ 是 AI 临时引入的人物；同名的 g_ 记录可能是同一人被识别了两次，
 * 只允许把 g_ 合并到同名的其他记录上（原台词保留，后续编号与头像统一）。
 */
import type { CharacterPortrait } from '@/api/types'

export interface StorySpeaker {
  id: string
  name: string
  portrait?: CharacterPortrait | null
  first_round?: number
  last_round?: number
}

export function parseStorySpeakers(raw: unknown): StorySpeaker[] {
  const list = (raw as { speakers?: unknown } | null)?.speakers
  if (!Array.isArray(list)) return []
  return list.filter((item): item is StorySpeaker =>
    !!item && typeof item.id === 'string' && !!item.id && typeof item.name === 'string')
}

export function isGuestSpeaker(speaker: StorySpeaker): boolean {
  return speaker.id.startsWith('g_')
}

/** 可作为合并目标的同名记录（只有临时人物才能被合并掉） */
export function mergeTargetsOf(speaker: StorySpeaker, all: StorySpeaker[]): StorySpeaker[] {
  if (!isGuestSpeaker(speaker)) return []
  return all.filter((other) => other.id !== speaker.id && other.name === speaker.name)
}

export function filterStorySpeakers(all: StorySpeaker[], query: string): StorySpeaker[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return all
  return all.filter((item) => `${item.name} ${item.id}`.toLocaleLowerCase().includes(needle))
}

/** 区分同名记录用的短编号（id 末 6 位，与上游一致） */
export function speakerShortId(speaker: StorySpeaker): string {
  return speaker.id.slice(-6)
}
