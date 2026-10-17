/**
 * 对局 SSE 被服务端撤销（diceframe/diceframe#512）后的对局 store 行为：
 * 凭证类原因走与请求被拒相同的路由回调，玩家入口关闭只提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient, errorMessage, hasRoomToken, hasSeatToken } from '@/api/client'
import { getT } from '@/i18n/t'
import { credentialKey } from '@/lib/seat-credentials'
import type { GameStreamHandlers } from '@/stream/gameStream'
import { useGameStore } from './game'

const { streams } = vi.hoisted(() => ({ streams: [] as { handlers: unknown; start: () => void; stop: () => void }[] }))
vi.mock('@/stream/gameStream', () => ({
  createGameStream: vi.fn((_key: string, _cursor: unknown, handlers: unknown) => {
    const stream = { handlers, start: vi.fn(), stop: vi.fn() }
    streams.push(stream)
    return stream
  }),
}))
vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return {
    useSettingsStore: create(() => ({ baseUrl: 'https://h.example', storeSeatToken: vi.fn() })),
    activeIdentityOf: () => null,
  }
})

const fetchMock = vi.fn()
const onShareCredentialRejected = vi.fn()
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
async function settle() {
  for (let index = 0; index < 60; index += 1) await Promise.resolve()
}
function handlers(): GameStreamHandlers {
  return streams[streams.length - 1].handlers as GameStreamHandlers
}

beforeEach(() => {
  useGameStore.getState().leave()
  streams.length = 0
  vi.clearAllMocks()
  configureApiClient({
    baseUrl: 'https://h.example', token: null, sessionToken: 'session',
    credentials: { [credentialKey('https://h.example', 'g')]: { seat: 'seat-g', room: 'room-g' } },
    share: { game: 'g', user: 'u1' }, onUnauthorized: undefined, onShareCredentialRejected,
  })
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname
    if (path.endsWith('/config')) return json({})
    if (path.endsWith('/characters')) return json({ players: [{ user_id: 'u1' }] })
    if (path.endsWith('/private-log')) return json({ messages: [] })
    if (path.endsWith('/table-talk')) return json({ exchanges: [] })
    if (path.endsWith('/log')) return json({ log: [], total_pages: 1 })
    if (path.endsWith('/map')) return json({ locations: [] })
    return json({ game_key: 'g', state: 'active_input', viewer: { kind: 'seat', uid: 'u1' } })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGameStore.getState().leave()
  vi.unstubAllGlobals()
})

describe('对局 SSE 被撤销', () => {
  it('SEAT_TOKEN_INVALID：清掉内存里的席位凭证，交给路由层走席位失效流程', async () => {
    useGameStore.getState().enter('g')
    await settle()
    handlers().onRevoked!({ errorCode: 'SEAT_TOKEN_INVALID', error: 'x', needsRoomPassword: false })
    expect(hasSeatToken('g')).toBe(false)
    expect(onShareCredentialRejected).toHaveBeenCalledWith({ kind: 'seat', baseUrl: 'https://h.example', game: 'g' })
    expect(useGameStore.getState().streamStatus).toBe('stopped')
  })

  it('ROOM_TOKEN_INVALID（或 needs_room_password）：清房间令牌，交给路由层重输房间密码', async () => {
    useGameStore.getState().enter('g')
    await settle()
    handlers().onRevoked!({ errorCode: 'ROOM_TOKEN_INVALID', error: '', needsRoomPassword: true })
    expect(hasRoomToken('g')).toBe(false)
    expect(hasSeatToken('g')).toBe(true)
    expect(onShareCredentialRejected).toHaveBeenCalledWith({ kind: 'room', baseUrl: 'https://h.example', game: 'g' })
  })

  it('PLAYER_ACCESS_CLOSED：只在对局页提示「玩家入口已关闭」，不跳转、不清凭证', async () => {
    useGameStore.getState().enter('g')
    await settle()
    handlers().onRevoked!({ errorCode: 'PLAYER_ACCESS_CLOSED', error: '本局玩家入口已关闭', needsRoomPassword: false })
    expect(onShareCredentialRejected).not.toHaveBeenCalled()
    expect(hasSeatToken('g')).toBe(true)
    expect(useGameStore.getState().error).toBe(errorMessage(new ApiError('', 403, 'PLAYER_ACCESS_CLOSED')))
  })
})

describe('实机：玩家入口关闭后重新开放，点重试要恢复实时连接', () => {
  it('撤销后状态为 stopped（不是「连接中」）；重试刷新成功后重新建流（新票据、新 /sse）', async () => {
    useGameStore.getState().enter('g')
    await settle()
    expect(streams).toHaveLength(1)
    handlers().onRevoked!({ errorCode: 'PLAYER_ACCESS_CLOSED', error: '', needsRoomPassword: false })
    expect(useGameStore.getState().streamStatus).toBe('stopped')
    await useGameStore.getState().refresh()
    await settle()
    expect(useGameStore.getState().error).toBe('')
    expect(streams).toHaveLength(2)
    expect(streams[1].start).toHaveBeenCalled()
  })

  it('刷新仍失败（入口还关着）：不重建流，保持 stopped', async () => {
    useGameStore.getState().enter('g')
    await settle()
    handlers().onRevoked!({ errorCode: 'PLAYER_ACCESS_CLOSED', error: '', needsRoomPassword: false })
    fetchMock.mockImplementation(async () => json({ ok: false, error_code: 'PLAYER_ACCESS_CLOSED', error: '本局玩家入口已关闭' }, 403))
    await useGameStore.getState().refresh()
    await settle()
    expect(streams).toHaveLength(1)
    expect(useGameStore.getState().streamStatus).toBe('stopped')
  })
})

describe('REST 的玩家入口关闭', () => {
  it('带 error_code PLAYER_ACCESS_CLOSED 时给出专门提示；不带码的裸 403 照旧给通用提示', () => {
    const closed = errorMessage(new ApiError('本局玩家入口已关闭', 403, 'PLAYER_ACCESS_CLOSED'))
    expect(closed).not.toBe(errorMessage(new ApiError('本局玩家入口已关闭', 403)))
    // 错误码先精确命中、再回退小写 key：上游现在为大写码单独提供了「联系 GM 重新开放」的文案。
    expect(closed).toBe(getT()('apiErrors.PLAYER_ACCESS_CLOSED'))
  })
})
