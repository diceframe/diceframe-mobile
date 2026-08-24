import { describe, expect, it } from 'vitest'

import type { LogEntry } from '@/api/types'
import { gameStateLabel, gameStateVariant, hasNewRound } from './game-state'

function pageOf(size: number, newestRound: number): LogEntry[] {
  return Array.from({ length: size }, (_, index) => ({ round: newestRound - size + 1 + index }))
}

describe('game state presentation', () => {
  it('把服务端状态码映射为移动端文案', () => {
    expect(gameStateLabel('active_action')).toBe('行动阶段')
    expect(gameStateLabel('active_judgment')).toBe('GM 思考中')
    expect(gameStateLabel('ended')).toBe('已结束')
  })

  it('未知状态保持原值，便于发现新服务端状态', () => {
    expect(gameStateLabel('custom_state')).toBe('custom_state')
    expect(gameStateVariant('custom_state')).toBe('secondary')
  })
})

describe('hasNewRound', () => {
  it('第一页饱和（长度不变）时仍能识别新回合', () => {
    expect(hasNewRound(pageOf(50, 56), pageOf(50, 57))).toBe(true)
  })

  it('无新回合时为 false，流式气泡不被误清', () => {
    expect(hasNewRound(pageOf(50, 56), pageOf(50, 56))).toBe(false)
    expect(hasNewRound([], [])).toBe(false)
    expect(hasNewRound(undefined, undefined)).toBe(false)
  })

  it('首次拉到日志（此前为空）视为新回合', () => {
    expect(hasNewRound([], pageOf(3, 3))).toBe(true)
  })
})
