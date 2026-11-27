import { describe, expect, it } from 'vitest'

import type { GameDetail } from '@/api/types'
import { playerFinaleOf, playerFinaleProjection } from './run-finale'

const detail: GameDetail = {
  game_key: 'web|test|bot', run_id: 'run-1', state: 'ended', viewer: { kind: 'seat', uid: 'alice' },
  run_lifecycle: { status: 'ended', id: 'archive-1', revision: 2 },
}
const identity = { runId: 'run-1', finaleId: 'archive-1', revision: 2 }
const response = {
  ok: true, run_id: 'run-1',
  finale: {
    id: 'archive-1', status: 'ended', epilogue: '尾声\n下一段', recap: '团录',
    character: { sanity: 37 }, gm_notes: 'private', characters: { bob: { sanity: 99 } },
    receipt: { details: 'internal' },
  },
  story: { plan: { private: true } },
}

describe('玩家结团入口', () => {
  it('必须是服务端确认的本席位与已结算档案', () => {
    expect(playerFinaleOf(detail, 'alice', false)).toEqual(identity)
    expect(playerFinaleOf(detail, 'bob', false)).toBeNull()
    expect(playerFinaleOf(detail, 'alice', true)).toBeNull()
    expect(playerFinaleOf({ ...detail, viewer: { kind: 'outsider' } }, 'alice', false)).toBeNull()
    expect(playerFinaleOf({ ...detail, viewer: { kind: 'gm', uid: 'alice' } }, 'alice', false)).toBeNull()
  })

  it('准备中、旧式 ended 和没有档案 ID 的状态均不开放', () => {
    expect(playerFinaleOf({ ...detail, run_lifecycle: { ...detail.run_lifecycle, status: 'preparing' } }, 'alice', false)).toBeNull()
    expect(playerFinaleOf({ ...detail, run_lifecycle: undefined }, 'alice', false)).toBeNull()
    expect(playerFinaleOf({ ...detail, run_lifecycle: { status: 'ended' } }, 'alice', false)).toBeNull()
  })
})

describe('结团档案投影', () => {
  it('保留公开正文与「有本人角色」标记，不保留角色内容或 GM 字段', () => {
    expect(playerFinaleProjection(response, identity)).toEqual({ epilogue: '尾声\n下一段', recap: '团录', hasCharacter: true })
    expect(playerFinaleProjection({ ...response, finale: { ...response.finale, character: null } }, identity)?.hasCharacter).toBe(false)
  })

  it('拒绝跨 run、跨档案、未提交草稿和不完整回包', () => {
    expect(playerFinaleProjection({ ...response, run_id: 'other' }, identity)).toBeNull()
    expect(playerFinaleProjection({ ...response, finale: { ...response.finale, id: 'other' } }, identity)).toBeNull()
    expect(playerFinaleProjection({ ...response, finale: { ...response.finale, status: 'preparing' } }, identity)).toBeNull()
    expect(playerFinaleProjection({ ...response, finale: { ...response.finale, recap: undefined } }, identity)).toBeNull()
    expect(playerFinaleProjection({ ...response, ok: false }, identity)).toBeNull()
  })
})
