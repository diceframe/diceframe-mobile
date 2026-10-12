/**
 * 设备实测回归（mobile #1，APK 0.5.5 vc15）：
 * - BUG 1：验证房间密码后写入房间令牌会同步 settings → client，加入页的临时分享身份被抹掉，
 *   详情与 POST /players 以非分享请求发出，有访问密码的服务器 401 并跳登录页；
 * - BUG 2：同一设备登录了房主再以玩家身份加入，玩家请求全带房主 Bearer、从不带席位凭证，
 *   服务端按房主预览处理（不能行动、viewer 不是本席位），对局页随即把身份清掉弹回加入页。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, configureApiClient, setJoinShare } from '@/api/client'
import { createPlayShareScope } from '@/lib/play-share-scope'
import { useSettingsStore } from './settings'

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    store: new Map<string, string>(),
    async getItem(key: string) {
      return this.store.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      this.store.set(key, value)
    },
  },
}))

vi.mock('react-native', () => ({
  Appearance: { getColorScheme: () => 'dark' },
}))

const SERVER = 'http://h:18000'
const fetchMock = vi.fn()
const onUnauthorized = vi.fn()

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function call(index: number) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit]
  return { url: new URL(url), headers: new Headers(init.headers) }
}

beforeEach(() => {
  useSettingsStore.setState({ ...useSettingsStore.getInitialState(), hydrated: true })
  configureApiClient({ baseUrl: '', token: null, share: null, sessionToken: null, credentials: {}, onUnauthorized, onShareCredentialRejected: undefined })
  setJoinShare(null)
  fetchMock.mockReset().mockImplementation(async () => json({ ok: true }))
  onUnauthorized.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useSettingsStore.getState().setBaseUrl(SERVER)
})

afterEach(() => {
  setJoinShare(null)
  vi.unstubAllGlobals()
})

describe('BUG 1：加入途中写 settings 不抹掉加入页的分享身份', () => {
  it('验证房间密码、存下房间令牌后：详情与 POST /players 仍带 game/share 与 X-Room-Token', async () => {
    setJoinShare({ game: 'GK', user: '' })
    // verifyRoom → storeRoomToken → syncApiClient（此刻还没有任何玩家身份）
    useSettingsStore.getState().storeRoomToken(SERVER, 'GK', 'room-token')
    await api('/games/GK')
    await api('/games/GK/players', { method: 'POST', body: '{}' })
    for (const index of [0, 1]) {
      const { url, headers } = call(index)
      expect(url.searchParams.get('game')).toBe('GK')
      expect(url.searchParams.get('share')).toBe('1')
      expect(headers.get('X-Room-Token')).toBe('room-token')
    }
  })

  it('setBaseUrl / storeSeatToken / clearShares 也不抹掉它', async () => {
    setJoinShare({ game: 'GK', user: '' })
    const store = useSettingsStore.getState()
    store.setBaseUrl(SERVER)
    store.storeSeatToken(SERVER, 'GK', 'seat-token')
    store.clearShares()
    await api('/games/GK')
    const { url, headers } = call(0)
    expect(url.searchParams.get('share')).toBe('1')
    expect(headers.get('X-Seat-Token')).toBe('seat-token')
  })

  it('加入流程中的 401 不触发跳登录页（由加入页就地报错）', async () => {
    setJoinShare({ game: 'GK', user: '' })
    fetchMock.mockImplementation(async () => json({ error: '未授权' }, 401))
    await expect(api('/games/GK')).rejects.toMatchObject({ status: 401 })
    await expect(api('/config', {}, { anonymous: true })).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('BUG 2：设备上登录了房主，以玩家身份加入与游玩', () => {
  it('加入请求不带房主凭据；拿到席位凭证、写入身份后，对局请求带席位凭证而不是房主 Bearer', async () => {
    const store = useSettingsStore.getState()
    store.setToken('owner-password')
    setJoinShare({ game: 'GK', user: '' })
    await api('/character-cards', { query: { share: 1 } })
    await api('/games/GK/players', { method: 'POST', body: '{}' })
    for (const index of [0, 1]) expect(call(index).headers.get('Authorization')).toBeNull()

    // create() 成功：存席位凭证 → enterAs 写身份并结束加入流程
    store.storeSeatToken(SERVER, 'GK', 'seat-token')
    store.upsertShare({ game: 'GK', user: 'u-new' })
    setJoinShare(null)
    await api('/games/GK/log')
    const { url, headers } = call(2)
    expect(headers.get('Authorization')).toBeNull()
    expect(headers.get('X-Seat-Token')).toBe('seat-token')
    expect(url.searchParams.get('share')).toBe('1')
    expect(url.searchParams.has('user')).toBe(false)
  })

  it('没有分享身份时（大厅、房主自己的对局）照常带房主 Bearer', async () => {
    useSettingsStore.getState().setToken('owner-password')
    await api('/games')
    expect(call(0).headers.get('Authorization')).toBe('Bearer owner-password')
  })
})

describe('对局页与注入的玩家身份', () => {
  function harness(active: string | null, owner = true) {
    const state = { active }
    const tasks: (() => void)[] = []
    const scope = createPlayShareScope({
      activeShareGame: () => state.active,
      ownerLoggedIn: () => owner,
      activate: (gameKey) => { state.active = gameKey },
    }, (task) => { tasks.push(task) })
    const flush = () => { while (tasks.length) tasks.shift()!() }
    return { state, scope, flush }
  }

  it('房主进入自己的对局时清掉别的局的玩家身份注入；进入玩家身份那一局则保留', () => {
    const own = harness('A')
    own.scope.enter('B')
    expect(own.state.active).toBeNull()
    const play = harness('A')
    play.scope.enter('A')
    expect(play.state.active).toBe('A')
  })

  it('房主离开玩家身份那一局后清掉注入；同一局紧接着重新挂载时不清；纯玩家不清', () => {
    const h = harness('A')
    h.scope.enter('A')
    h.scope.leave('A')
    h.scope.enter('A')
    h.flush()
    expect(h.state.active).toBe('A')
    h.scope.leave('A')
    h.flush()
    expect(h.state.active).toBeNull()

    const player = harness('A', false)
    player.scope.enter('A')
    player.scope.leave('A')
    player.flush()
    expect(player.state.active).toBe('A')
  })
})
