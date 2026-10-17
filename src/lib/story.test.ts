import { describe, expect, it } from 'vitest'

import type { StorySequence } from '@/api/types'

import { groupStorySegments, isStorySequence, speakerFallback } from './story'

const ALICE = 's_0123456789abcdef0123'
const GUEST = 'g_fedcba9876543210fedc'

const story: StorySequence = {
  version: 1,
  segments: [
    { id: '1', kind: 'narration', text: '雨夜。' },
    { id: '2', kind: 'dialogue', text: '有人吗？', speaker_id: ALICE, speaker_name: 'Alice' },
    { id: '3', kind: 'dialogue', text: '我进来了。', speaker_id: ALICE, speaker_name: 'Alice' },
    { id: '4', kind: 'dialogue', text: '谁？', speaker_id: GUEST, speaker_name: '守夜人' },
    { id: '5', kind: 'narration', text: '灯灭了。' },
    { id: '6', kind: 'narration', text: '寂静。' },
  ],
}

describe('剧情序列校验', () => {
  it('合法序列通过', () => {
    expect(isStorySequence(story)).toBe(true)
  })

  it('版本、空段落、缺字段、说话人 id 格式不对都拒收', () => {
    expect(isStorySequence(null)).toBe(false)
    expect(isStorySequence({ ...story, version: 2 })).toBe(false)
    expect(isStorySequence({ version: 1, segments: [] })).toBe(false)
    expect(isStorySequence({ version: 1, segments: [{ id: '1', kind: 'narration', text: '' }] })).toBe(false)
    expect(isStorySequence({ version: 1, segments: [{ id: '1', kind: 'aside', text: 'x' }] })).toBe(false)
    expect(isStorySequence({ version: 1, segments: [{ id: '1', kind: 'dialogue', text: 'x', speaker_id: 'npc_1', speaker_name: 'A' }] })).toBe(false)
    expect(isStorySequence({ version: 1, segments: [{ id: '1', kind: 'dialogue', text: 'x', speaker_id: ALICE, speaker_name: '  ' }] })).toBe(false)
  })
})

describe('剧情分组', () => {
  it('同一说话人连续台词合并，旁白每段独立', () => {
    expect(groupStorySegments(story).map((group) => group.segments.map((segment) => segment.id))).toEqual([
      ['1'], ['2', '3'], ['4'], ['5'], ['6'],
    ])
  })
})

describe('说话人兜底头像', () => {
  it('取名字前两个字符并大写，同一 id 颜色稳定', () => {
    expect(speakerFallback(ALICE, 'alice').initials).toBe('AL')
    expect(speakerFallback(GUEST, '守夜人').initials).toBe('守夜')
    expect(speakerFallback('', '').initials).toBe('?')
    expect(speakerFallback(ALICE, 'x').color).toBe(speakerFallback(ALICE, 'y').color)
    expect(speakerFallback(ALICE).color).toMatch(/^#[0-9a-f]{6}$/)
  })
})
