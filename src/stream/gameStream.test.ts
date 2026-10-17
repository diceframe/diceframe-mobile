import { describe, expect, it } from 'vitest'

import { gameSseEffect } from './gameStream'

describe('gameSseEffect', () => {
  it('baseline / narration_delta / narration_reset / story_update 精确映射', () => {
    expect(gameSseEffect({ type: 'baseline' })).toBe('baseline')
    expect(gameSseEffect({ type: 'narration_delta', text: 'x' })).toBe('narration-delta')
    expect(gameSseEffect({ type: 'narration_reset' })).toBe('narration-reset')
    expect(gameSseEffect({ type: 'story_update' })).toBe('story-update')
  })

  it('其余类型一律触发完整刷新（narration/state/rollback/public_actions/players/refresh/private…）', () => {
    for (const type of [
      'narration',
      'state',
      'rollback',
      'public_actions',
      'players',
      'refresh',
      'private',
      'private_reset',
      '',
      undefined,
    ]) {
      expect(gameSseEffect({ type })).toBe('refresh')
    }
  })

  it('空 payload 视为 refresh', () => {
    expect(gameSseEffect(null)).toBe('refresh')
  })
})
