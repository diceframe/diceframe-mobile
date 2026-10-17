import { describe, expect, it, vi } from 'vitest'

import type { GameDetail } from '@/api/types'

import { selectGmThinking, type GameStore } from './game'

vi.mock('@/stream/gameStream', () => ({
  createGameStream: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))
vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return { useSettingsStore: create(() => ({})), activeIdentityOf: () => null }
})

const state = (detail: Partial<GameDetail>, extra: Partial<GameStore> = {}) =>
  ({ detail, liveNarration: '', liveStory: null, ...extra }) as GameStore

describe('GM 思考中', () => {
  it('判定阶段且无待决项才算思考', () => {
    expect(selectGmThinking(state({ state: 'active_judgment' }))).toBe(true)
    expect(selectGmThinking(state({ state: 'active_judgment', pending_push_decisions: [{ check_id: 'c' }] }))).toBe(false)
    expect(selectGmThinking(state({ state: 'active_judgment', pending_luck_decisions: [{ check_id: 'c' }] }))).toBe(false)
  })

  it('有流式叙事或剧情快照时总算思考', () => {
    expect(selectGmThinking(state({ state: 'action' }, { liveNarration: '…' }))).toBe(true)
    expect(selectGmThinking(state({ state: 'action' }, { liveStory: { version: 1, segments: [] } }))).toBe(true)
    expect(selectGmThinking(state({ state: 'action' }))).toBe(false)
  })
})
