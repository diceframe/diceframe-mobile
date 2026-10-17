/**
 * 剧情「角色对话」模式的纯逻辑，逐条对齐上游 frontend-v2/src/features/play/story/story.ts。
 *
 * story_mode = 'dialogue' 时，GM 回合在 LogEntry.story 里带一份分段序列（旁白 / 台词），
 * 生成中经 SSE `story_update` 下发整份快照（不是增量）。校验不过的序列一律当作没有，
 * 回退到普通叙事文本，所以这里宁严勿宽。
 */
import type { StorySegment, StorySequence } from '@/api/types'

/** 服务端说话人 id：s_ = 席位角色，g_ = 临时登场角色，后接 20 位十六进制 */
const SPEAKER_ID_RE = /^[sg]_[a-f0-9]{20}$/

export function isStorySequence(value: unknown): value is StorySequence {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { version?: unknown; segments?: unknown }
  if (candidate.version !== 1 || !Array.isArray(candidate.segments) || candidate.segments.length === 0) return false
  return candidate.segments.every((segment) => {
    if (!segment || typeof segment !== 'object') return false
    const item = segment as Partial<StorySegment>
    if (!item.id || typeof item.id !== 'string' || !item.text || typeof item.text !== 'string') return false
    if (item.kind !== 'narration' && item.kind !== 'dialogue') return false
    if (item.kind === 'dialogue' && (typeof item.speaker_id !== 'string' || !SPEAKER_ID_RE.test(item.speaker_id)
      || typeof item.speaker_name !== 'string' || !item.speaker_name.trim())) return false
    if (item.speaker_name !== undefined && typeof item.speaker_name !== 'string') return false
    return true
  })
}

export interface StorySegmentGroup {
  key: string
  segments: StorySegment[]
}

/** 同一说话人连续的台词并成一组（一个头像多个气泡）；每段旁白自成一组。 */
export function groupStorySegments(story: StorySequence): StorySegmentGroup[] {
  const groups: StorySegmentGroup[] = []
  for (const segment of story.segments) {
    const identity = segment.kind === 'dialogue' ? `dialogue:${segment.speaker_id || 'unknown'}` : `narration:${segment.id}`
    const previous = groups[groups.length - 1]
    if (previous && previous.key.startsWith(`${identity}:`)) previous.segments.push(segment)
    else groups.push({ key: `${identity}:${segment.id}`, segments: [segment] })
  }
  return groups
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 没有立绘时的首字头像。色板是上游的固定数据（不是主题色）：同一说话人在 Web 与
 * 移动端必须同色，所以照搬色值与 FNV-1a 取色算法，不走主题令牌。
 */
const SPEAKER_PALETTE = ['#254b72', '#2f5d50', '#70405f', '#6b4e2e', '#3f4b78', '#4d5f2b', '#704342', '#3f5361']

export function speakerFallback(speakerId = '', speakerName = ''): { initials: string; color: string } {
  const value = String(speakerName || '?').trim()
  const initials = Array.from(value).slice(0, 2).join('').toUpperCase() || '?'
  return { initials, color: SPEAKER_PALETTE[stableHash(speakerId) % SPEAKER_PALETTE.length] }
}
