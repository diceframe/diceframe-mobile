import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient } from '@/api/client'
import { useGameStore } from './game'

vi.mock('@/stream/gameStream', () => ({
  createGameStream: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))
vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return {
    useSettingsStore: create(() => ({ baseUrl: 'https://claim.example', storeSeatToken: vi.fn() })),
    activeIdentityOf: () => null,
  }
})

const fetchMock = vi.fn()
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
async function settle() {
  for (let index = 0; index < 60; index += 1) await Promise.resolve()
}

/** 详情接口按什么视角投影（服务端用它告诉我们 ?user= 回退是否仍被认可） */
let detailViewer: unknown
let claimResponse: () => Response

beforeEach(() => {
  useGameStore.getState().leave()
  vi.clearAllMocks()
  detailViewer = { kind: 'seat', uid: 'u1' }
  claimResponse = () => json({ ok: false, error_code: 'SEAT_NOT_BOUND', error: 'x' }, 403)
  configureApiClient({
    baseUrl: 'https://claim.example', token: null, sessionToken: 'session', credentials: {},
    share: { game: 'g', user: 'u1' }, onUnauthorized: undefined, onShareCredentialRejected: undefined,
  })
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname
    if (path.endsWith('/seat-token/claim')) return claimResponse()
    if (path.endsWith('/config')) return json({})
    if (path.endsWith('/characters')) return json({ players: [{ user_id: 'u1' }] })
    if (path.endsWith('/private-log')) return json({ messages: [] })
    if (path.endsWith('/table-talk')) return json({ exchanges: [] })
    if (path.endsWith('/log')) return json({ log: [], total_pages: 1 })
    if (path.endsWith('/map')) return json({ locations: [] })
    return json({ game_key: 'g', state: 'active_input', viewer: detailViewer })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGameStore.getState().leave()
  vi.unstubAllGlobals()
})

describe('领取首枚席位凭证被明确拒绝时', () => {
  it('服务端仍按 ?user= 认出本席位（无访问密码）：不踢回加入页，继续入局', async () => {
    useGameStore.getState().enter('g')
    await settle()
    expect(useGameStore.getState().seatCredentialLost).toBe(false)
    // 回退路径继续发 ?user=，服务端据此投影本席位
    const detailCall = fetchMock.mock.calls.find(([url]) => new URL(url).pathname === '/api/games/g')
    expect(new URL(detailCall![0]).searchParams.get('user')).toBe('u1')
  })

  it('服务端强制席位凭证（只给访客大厅视图）：判定回不去，交给对局页清身份', async () => {
    detailViewer = { kind: 'outsider' }
    useGameStore.getState().enter('g')
    await settle()
    expect(useGameStore.getState().seatCredentialLost).toBe(true)
  })

  it('断网等非结论性失败不触发判定请求，也不踢人', async () => {
    claimResponse = () => json({ ok: false }, 503)
    detailViewer = { kind: 'outsider' }
    useGameStore.getState().enter('g')
    await settle()
    expect(useGameStore.getState().seatCredentialLost).toBe(false)
  })
})

describe('设备上登录了房主、以玩家身份进入对局（GM / 玩家身份独立）', () => {
  it('按普通玩家入局：没有席位凭证就领取，请求不带房主 Bearer；服务端投影本席位时不踢回加入页', async () => {
    claimResponse = () => json({ ok: true, seat_token: 'claimed' })
    configureApiClient({ token: 'owner' })
    useGameStore.getState().enter('g')
    await settle()
    const claim = fetchMock.mock.calls.find(([url]) => new URL(url).pathname.endsWith('/seat-token/claim'))
    expect(claim).toBeTruthy()
    for (const [, init] of fetchMock.mock.calls) expect(new Headers((init as RequestInit).headers).get('Authorization')).toBeNull()
    expect(useGameStore.getState()).toMatchObject({ isGm: false, userId: 'u1', seatCredentialLost: false })
  })
})
