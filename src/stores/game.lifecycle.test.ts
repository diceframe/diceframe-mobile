import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient } from '@/api/client'
import { createGameStream } from '@/stream/gameStream'
import { useGameStore } from './game'

vi.mock('@/stream/gameStream', () => ({
  createGameStream: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}))
vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return {
    useSettingsStore: create(() => ({})),
    activeIdentityOf: () => null,
  }
})

const fetchMock = vi.fn()
function json(data: unknown) { return new Response(JSON.stringify(data)) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function settle() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve()
}
let pendingPath: string
let pending: ReturnType<typeof deferred<Response>>

beforeEach(() => {
  vi.useFakeTimers()
  useGameStore.getState().leave()
  vi.clearAllMocks()
  pendingPath = ''
  pending = deferred<Response>()
  configureApiClient({
    baseUrl: 'https://lifecycle.example', token: null, sessionToken: 'session',
    share: { game: 'g', user: 'u1' }, onUnauthorized: undefined,
  })
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    const path = new URL(url).pathname
    if (pendingPath && path.endsWith(pendingPath)) return pending.promise
    if (path.endsWith('/config')) return json({})
    if (path.endsWith('/claim-gm')) return json({ user_id: 'gm' })
    if (path.endsWith('/characters')) return json({ players: [{ user_id: 'u1' }] })
    if (path.endsWith('/private-log')) return json({ messages: [] })
    if (path.endsWith('/table-talk')) return json({ exchanges: [] })
    if (path.endsWith('/log')) return json({ log: [{ round: 2 }], total_pages: 1 })
    if (path.endsWith('/map')) return json({ locations: [] })
    return json({ state: 'active_input', round_number: 2 })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  useGameStore.getState().leave()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('对局解锁恢复', () => {
  it.each(['/config', '/map', '/table-talk'])('%s 挂起不会阻断 SSE 建连', async (path) => {
    pendingPath = path
    useGameStore.getState().enter('g')
    await settle()
    expect(createGameStream).toHaveBeenCalledOnce()
    expect(vi.mocked(createGameStream).mock.results[0].value.start).toHaveBeenCalledOnce()
  })

  it('未收到 pause 也能重建旧连接，保留本局身份、游标和叙事', async () => {
    useGameStore.getState().enter('g')
    await settle()
    const first = vi.mocked(createGameStream).mock.results[0].value
    useGameStore.setState({ cursor: 'r2.p1', liveNarration: '尚未落地的叙事' })
    useGameStore.getState().resume()
    await settle()
    expect(first.stop).toHaveBeenCalledOnce()
    expect(createGameStream).toHaveBeenCalledTimes(2)
    expect(vi.mocked(createGameStream).mock.calls[1][1]()).toBe('r2.p1')
    expect(useGameStore.getState()).toMatchObject({
      gameKey: 'g', userId: 'u1', cursor: 'r2.p1', liveNarration: '尚未落地的叙事',
    })
  })

  it('锁屏前的慢刷新不能覆盖解锁后拉取的新状态', async () => {
    pendingPath = '/games/g'
    useGameStore.getState().enter('g')
    await settle()
    expect(useGameStore.getState().loading).toBe(true)
    useGameStore.getState().pause()
    expect(useGameStore.getState()).toMatchObject({ loading: false, streamStatus: 'idle' })
    pendingPath = ''
    useGameStore.getState().resume()
    await settle()
    expect(useGameStore.getState().detail?.round_number).toBe(2)
    pending.resolve(json({ state: 'active_input', round_number: 1 }))
    await settle()
    expect(useGameStore.getState().detail?.round_number).toBe(2)
    expect(createGameStream).toHaveBeenCalledTimes(2)
  })

  it('订阅恢复成功会补拉此前失败或挂起的整局数据', async () => {
    pendingPath = '/games/g'
    useGameStore.getState().enter('g')
    await settle()
    expect(useGameStore.getState().loading).toBe(true)
    pendingPath = ''
    const handlers = vi.mocked(createGameStream).mock.calls[0][2]
    handlers.onStatusChange('live')
    await settle()
    expect(useGameStore.getState()).toMatchObject({ loading: false, detail: { round_number: 2 } })
    pending.resolve(json({ round_number: 1 }))
    await settle()
    expect(useGameStore.getState().detail?.round_number).toBe(2)

    handlers.onStatusChange('connecting')
    useGameStore.setState({ error: '连接中断' })
    fetchMock.mockClear()
    handlers.onStatusChange('live')
    await settle()
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).pathname === '/api/games/g')).toBe(true)
    expect(useGameStore.getState().error).toBe('')
  })

  it('GM 身份恢复请求挂起时有超时，不永久卡在重连前', async () => {
    configureApiClient({ share: null, token: 'owner' })
    const normalFetch = fetchMock.getMockImplementation()!
    let claimSignal: AbortSignal | undefined
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (!url.includes('/claim-gm')) return normalFetch(url, init)
      claimSignal = init.signal as AbortSignal
      return new Promise((_resolve, reject) => {
        claimSignal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    useGameStore.getState().enter('g')
    await settle()
    expect(createGameStream).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(15000)
    expect(claimSignal?.aborted).toBe(true)
    expect(createGameStream).toHaveBeenCalledOnce()
  })

  it('锁屏期间废弃旧 GM 恢复请求，解锁后只启动新连接', async () => {
    configureApiClient({ share: null, token: 'owner' })
    pendingPath = '/claim-gm'
    useGameStore.getState().enter('g')
    await settle()
    const signal = fetchMock.mock.calls.find(([url]) => url.includes('/claim-gm'))![1].signal
    useGameStore.getState().pause()
    expect(signal.aborted).toBe(true)
    pendingPath = ''
    useGameStore.getState().resume()
    await settle()
    pending.resolve(json({ user_id: 'old-gm' }))
    await settle()
    expect(createGameStream).toHaveBeenCalledOnce()
    expect(useGameStore.getState().userId).toBe('gm')
  })
})
