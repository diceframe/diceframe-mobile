import { describe, expect, it } from 'vitest'

import type { GameDetail, Player } from '@/api/types'

import {
  awayControlPolicy,
  normalizeAwayPolicy,
  readyProgress,
  controlToggleFor,
  isTemporaryHost,
  playerControlMode,
} from './player-control'

const player = (control?: Player['control']): Player => ({
  user_id: 'u1',
  character_name: '莱拉',
  ...(control ? { control } : {}),
})

describe('席位控制方式', () => {
  it('老服务端不下发 control 时按真人处理', () => {
    expect(playerControlMode(player())).toBe('human')
    expect(playerControlMode(null)).toBe('human')
    expect(playerControlMode(player({ mode: 'gm' }))).toBe('human')
  })

  it('识别 AI 托管与等待认领', () => {
    expect(playerControlMode(player({ mode: 'ai' }))).toBe('ai')
    expect(playerControlMode(player({ mode: 'unclaimed' }))).toBe('unclaimed')
  })

  it('临时托管只在 AI 且 temporary 时成立', () => {
    expect(isTemporaryHost(player({ mode: 'ai', temporary: true }))).toBe(true)
    expect(isTemporaryHost(player({ mode: 'ai' }))).toBe(false)
    expect(isTemporaryHost(player({ mode: 'human', temporary: true }))).toBe(false)
  })
})

describe('GM 可做的托管切换', () => {
  it('玩家与等待认领都能设为 AI', () => {
    expect(controlToggleFor(player())).toBe('ai')
    expect(controlToggleFor(player({ mode: 'unclaimed' }))).toBe('ai')
  })

  it('GM 显式托管可以交回玩家', () => {
    expect(controlToggleFor(player({ mode: 'ai' }))).toBe('human')
  })

  it('暂离带来的临时托管不给托管按钮（该点的是「回来」）', () => {
    expect(controlToggleFor(player({ mode: 'ai', temporary: true }))).toBeNull()
  })
})

describe('房间暂离语义', () => {
  const detail = (policy?: string): GameDetail =>
    ({ game_key: 'g1', ...(policy ? { away_control_policy: policy } : {}) }) as GameDetail

  it('只有显式 ai_takeover 才交给 AI，其余一律 pause', () => {
    expect(awayControlPolicy(detail('ai_takeover'))).toBe('ai_takeover')
    expect(awayControlPolicy(detail('pause'))).toBe('pause')
    expect(awayControlPolicy(detail('nonsense'))).toBe('pause')
    expect(awayControlPolicy(detail())).toBe('pause')
    expect(awayControlPolicy(null)).toBe('pause')
  })

  it('设置草稿等裸值走同一条归一化', () => {
    expect(normalizeAwayPolicy('ai_takeover')).toBe('ai_takeover')
    expect(normalizeAwayPolicy(undefined)).toBe('pause')
    expect(normalizeAwayPolicy('')).toBe('pause')
  })
})

describe('就绪进度', () => {
  it('分母只算真人活跃席位，AI 与未认领席位不计入', () => {
    expect(readyProgress({
      ready_count: 1,
      player_count: 4,
      waiting_players: [{ user_id: 'u2', character_name: 'B' }],
    })).toEqual({ ready: 1, total: 2 })
  })

  it('全员就绪时分子分母相等', () => {
    expect(readyProgress({ ready_count: 3, player_count: 5, waiting_players: [] })).toEqual({ ready: 3, total: 3 })
  })

  it('没有多人状态时为 0/0（单人局不展示该行）', () => {
    expect(readyProgress(null)).toEqual({ ready: 0, total: 0 })
  })
})
