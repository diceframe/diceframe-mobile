import { describe, expect, it } from 'vitest'

import {
  checkModeRequestBody,
  parseCheckModeState,
  pendingCheckModeSeats,
  visibleCheckModeSeats,
  type CheckModeSeat,
} from './check-modes'

const seat = (uid: string, extra: Partial<CheckModeSeat> = {}): CheckModeSeat => ({
  uid,
  name: uid,
  kind: 'dnd_advantage',
  scope: 'narrative_round',
  context_id: `ctx-${uid}`,
  blocked_reason: '',
  request: null,
  grant: null,
  previews: [{ label: 'Attack', mode: '', sources: [] }],
  ...extra,
})

const state = (seats: CheckModeSeat[], isGm = true) => ({ ok: true as const, revision: 4, run_id: 'run', is_gm: isGm, seats })

describe('检定模式契约', () => {
  it('合法状态原样通过', () => {
    const raw = state([seat('a', { request: { mode: 'advantage', reason: '高处', status: 'pending' } })])
    expect(parseCheckModeState(raw)).toEqual(raw)
  })

  it('任一字段不合契约就整体拒收', () => {
    expect(parseCheckModeState(null)).toBeNull()
    expect(parseCheckModeState({ ...state([]), ok: false })).toBeNull()
    expect(parseCheckModeState({ ...state([]), revision: 1.5 })).toBeNull()
    expect(parseCheckModeState(state([seat('a', { request: { mode: 'bonus' as never, reason: '', status: 'pending' } })]))).toBeNull()
    expect(parseCheckModeState(state([seat('a', { previews: [{ label: 'x', mode: '', sources: [{ code: 'c', mode: '' as never }] }] })]))).toBeNull()
  })

  it('玩家只看自己；不支持的规则与无 kind 席位隐藏', () => {
    const seats = [seat('a'), seat('b'), seat('c', { blocked_reason: 'unsupported' }), seat('d', { kind: '' })]
    expect(visibleCheckModeSeats(state(seats, true), 'a', true).map((item) => item.uid)).toEqual(['a', 'b'])
    expect(visibleCheckModeSeats(state(seats, false), 'a', true).map((item) => item.uid)).toEqual(['a'])
    expect(visibleCheckModeSeats(null, 'a', false)).toEqual([])
  })

  it('待审与请求体', () => {
    const pending = seat('a', { request: { mode: 'advantage', reason: 'r', status: 'pending' } })
    expect(pendingCheckModeSeats([pending, seat('b')])).toEqual([pending])
    expect(checkModeRequestBody(state([pending]), pending, { mode: 'disadvantage', reason: '雾' })).toEqual({
      expected_revision: 4, run_id: 'run', context_id: 'ctx-a', mode: 'disadvantage', reason: '雾',
    })
    expect(checkModeRequestBody(state([pending]), pending)).toEqual({ expected_revision: 4, run_id: 'run', context_id: 'ctx-a' })
  })
})
