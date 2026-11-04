import { describe, expect, it } from 'vitest'

import type { LogEntry } from '@/api/types'
import { gameStateLabel, gameStateTone, hasNewRound, runReadOnlyOf } from './game-state'

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
    expect(gameStateTone('custom_state')).toBe('secondary')
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

describe('结团只读判定', () => {
  it('准备结团时 state 仍是行动阶段，也要按只读处理', () => {
    expect(runReadOnlyOf({ state: 'active_action', run_lifecycle: { status: 'preparing', id: 'f1', revision: 2 } })).toBe('preparing')
    expect(runReadOnlyOf({ state: 'paused', run_lifecycle: { status: 'preparing' } })).toBe('preparing')
  })

  it('已结团或对局已结束都算结束', () => {
    expect(runReadOnlyOf({ state: 'ended', run_lifecycle: { status: 'ended' } })).toBe('ended')
    expect(runReadOnlyOf({ state: 'ended' })).toBe('ended')
    expect(runReadOnlyOf({ state: 'active_action', run_lifecycle: { status: 'ended' } })).toBe('ended')
  })

  it('进行中或旧服务端没有该字段时不锁', () => {
    expect(runReadOnlyOf({ state: 'active_action', run_lifecycle: { status: 'playing' } })).toBeNull()
    expect(runReadOnlyOf({ state: 'active_action' })).toBeNull()
    expect(runReadOnlyOf(null)).toBeNull()
  })
})
