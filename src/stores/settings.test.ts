import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  api,
  buildPlaySseUrl,
  configureApiClient,
  currentSessionToken,
  currentShare,
  currentToken,
  hasRoomToken,
  hasSeatToken,
  normalizeBaseUrl,
  shareQuery,
} from '@/api/client'
import { credentialKey } from '@/lib/seat-credentials'
import { readThemeToken, resolveTheme } from '@/lib/theme'
import { activeIdentityOf, adoptLegacyRoomTokens, useSettingsStore } from './settings'

// settings store 依赖 AsyncStorage（RN 模块），单测里换成内存实现。
// vitest 会把 vi.mock 提升到文件顶部，实际先于上面的 import 执行。
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
  Appearance: {
    getColorScheme: () => 'dark',
  },
  Platform: { OS: 'android' },
}))

describe('settings store 登录/登出状态机（回归：退出登录后必须能重新进入）', () => {
  it('主题解析：system 跟随设备，显式模式覆盖设备主题', () => {
    expect(resolveTheme('system', 'light')).toBe('light')
    expect(resolveTheme('system', 'dark')).toBe('dark')
    expect(resolveTheme('light', 'dark')).toBe('light')
    expect(resolveTheme('dark', 'light')).toBe('dark')
  })

  it('原生/SVG 主题令牌随解析主题切换', () => {
    expect(readThemeToken('foreground', 'dark')).toBe('#eef2ec')
    expect(readThemeToken('foreground', 'light')).toBe('#201c16')
    expect(readThemeToken('primary', 'dark')).toBe('#55b9bd')
    expect(readThemeToken('primary', 'light')).toBe('#277f84')
  })

  it('主题偏好写入共享 store', () => {
    useSettingsStore.getState().setThemeMode('light')
    expect(useSettingsStore.getState().themeMode).toBe('light')
    useSettingsStore.getState().setThemeMode('dark')
    expect(useSettingsStore.getState().themeMode).toBe('dark')
  })

  it('语言偏好默认跟随系统，可显式覆盖', () => {
    expect(useSettingsStore.getState().language).toBe('system')
    useSettingsStore.getState().setLanguage('en')
    expect(useSettingsStore.getState().language).toBe('en')
    useSettingsStore.getState().setLanguage('system')
    expect(useSettingsStore.getState().language).toBe('system')
  })

  beforeEach(() => {
    useSettingsStore.setState({
      baseUrl: '',
      recentBaseUrls: [],
      serverSessionTokens: {},
      serverPasswords: {},
      token: null,
      shares: {},
      activeShareGame: null,
    })
    configureApiClient({ baseUrl: '', token: null, share: null, sessionToken: null })
  })

  it('登录 → API client 同步 token → 登出 → token 清空且 client 同步', () => {
    const store = useSettingsStore.getState()

    store.setBaseUrl(normalizeBaseUrl('192.168.1.5:18000'))
    store.setToken('secret')
    expect(useSettingsStore.getState().token).toBe('secret')
    expect(currentToken()).toBe('secret')

    // 退出登录（profile 的 退出登录 按钮）
    useSettingsStore.getState().setToken(null)
    expect(useSettingsStore.getState().token).toBeNull()
    expect(currentToken()).toBeNull()

    // 重新登录
    useSettingsStore.getState().setToken('secret2')
    expect(useSettingsStore.getState().token).toBe('secret2')
    expect(currentToken()).toBe('secret2')
  })

  it('只把成功保存的服务器地址加入最近列表，并保留上一个地址', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('a:18000')
    useSettingsStore.getState().setBaseUrl('http://b:18000/')

    expect(useSettingsStore.getState().recentBaseUrls).toEqual([
      'http://b:18000',
      'http://a:18000',
    ])
  })

  it('可从本机列表主动移除服务器且不影响当前连接', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    useSettingsStore.getState().setBaseUrl('http://b:18000')
    useSettingsStore.getState().removeRecentServer('http://a:18000/')

    expect(useSettingsStore.getState().recentBaseUrls).toEqual(['http://b:18000'])
    expect(useSettingsStore.getState().serverSessionTokens).not.toHaveProperty('http://a:18000')
    expect(useSettingsStore.getState().baseUrl).toBe('http://b:18000')
  })

  it('密码本按台记录访问密码；空密码 = 移除记录（免密服务器不留条目）', () => {
    const store = useSettingsStore.getState()
    store.rememberServerPassword('http://a:18000', 'pw-a')
    store.rememberServerPassword('http://b:18000/', 'pw-b')
    expect(useSettingsStore.getState().serverPasswords).toEqual({
      'http://a:18000': 'pw-a',
      'http://b:18000': 'pw-b',
    })

    // 同一台服务器改密 → 覆盖；免密 → 移除
    useSettingsStore.getState().rememberServerPassword('a:18000', 'pw-a2')
    expect(useSettingsStore.getState().serverPasswords['http://a:18000']).toBe('pw-a2')
    useSettingsStore.getState().rememberServerPassword('http://a:18000', '')
    expect(useSettingsStore.getState().serverPasswords).not.toHaveProperty('http://a:18000')
    expect(useSettingsStore.getState().serverPasswords['http://b:18000']).toBe('pw-b')
  })

  it('忘掉服务器时连带清除密码本里对应的密码', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    useSettingsStore.getState().setBaseUrl('http://b:18000')
    useSettingsStore.getState().rememberServerPassword('http://a:18000', 'pw-a')
    useSettingsStore.getState().removeRecentServer('http://a:18000')

    expect(useSettingsStore.getState().serverPasswords).not.toHaveProperty('http://a:18000')
  })

  it('换服务器清空 token 与玩家身份', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.setToken('secret')
    store.upsertShare({ game: 'g', user: 'u1' })

    store.setBaseUrl('http://b:18000')
    useSettingsStore.getState().setToken(null)
    useSettingsStore.getState().clearShares()

    const state = useSettingsStore.getState()
    expect(state.baseUrl).toBe('http://b:18000')
    expect(state.token).toBeNull()
    expect(state.shares).toEqual({})
    expect(state.activeShareGame).toBeNull()
    expect(activeIdentityOf(state)).toBeNull()
    expect(currentShare()).toBeNull()
    expect(shareQuery()).toBeNull()
  })

  it('多局加入、切换及同局重绑同步更新 API 分享参数，不串用房间凭据', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.setToken('owner-token')
    const sessionToken = currentSessionToken()
    const first = { game: 'a', user: 'u-a', name: 'Aria', delegate: 'd-a' }
    const second = { game: 'b', user: 'u-b' }
    store.upsertShare(first)
    store.upsertShare(second)
    expect(activeIdentityOf(useSettingsStore.getState())).toEqual(second)
    expect(Object.fromEntries(shareQuery()!)).toEqual({ game: 'b', user: 'u-b', share: '1' })

    store.activateShare('a')
    expect(currentShare()).toEqual(first)
    expect(Object.fromEntries(shareQuery()!)).toEqual({
      game: 'a', user: 'u-a', name: 'Aria', share: '1', delegate: 'd-a',
    })
    store.upsertShare({ game: 'a', user: 'rebound-user' })
    expect(Object.fromEntries(shareQuery()!)).toEqual({ game: 'a', user: 'rebound-user', share: '1' })
    expect(useSettingsStore.getState().shares.b).toEqual(second)
    expect(currentToken()).toBe('owner-token')
    expect(currentSessionToken()).toBe(sessionToken)
  })

  it.each([null, 'missing'])('取消激活或激活缺失槽位 %s 清空 API 注入但保留身份', (gameKey) => {
    const store = useSettingsStore.getState()
    const identity = { game: 'a', user: 'u-a' }
    store.upsertShare(identity)
    store.activateShare(gameKey)
    expect(useSettingsStore.getState().activeShareGame).toBeNull()
    expect(useSettingsStore.getState().shares).toEqual({ a: identity })
    expect(activeIdentityOf(useSettingsStore.getState())).toBeNull()
    expect(currentShare()).toBeNull()
    expect(shareQuery()).toBeNull()
  })

  it('移除其他局不影响当前注入；移除当前局清空注入且不自动切到剩余身份', () => {
    const store = useSettingsStore.getState()
    const current = { game: 'a', user: 'u-a' }
    const remaining = { game: 'b', user: 'u-b' }
    store.upsertShare(current)
    store.upsertShare(remaining)
    store.upsertShare({ game: 'c', user: 'u-c' })
    store.activateShare('a')
    store.removeShare('c')
    store.removeShare('missing')
    expect(useSettingsStore.getState().activeShareGame).toBe('a')
    expect(currentShare()).toEqual(current)
    expect(shareQuery()?.get('user')).toBe('u-a')

    store.removeShare('a')
    expect(useSettingsStore.getState().shares).toEqual({ b: remaining })
    expect(useSettingsStore.getState().activeShareGame).toBeNull()
    expect(activeIdentityOf(useSettingsStore.getState())).toBeNull()
    expect(currentShare()).toBeNull()
    expect(shareQuery()).toBeNull()
  })

  it.each([0, 1, 2])('v%d 升级到 v3 时丢弃旧凭据、身份和设备偏好，重置结果落盘', async (version) => {
    await AsyncStorage.setItem('diceframe-settings', JSON.stringify({
      version,
      state: {
        baseUrl: 'http://old:18000',
        recentBaseUrls: ['http://old:18000'],
        serverSessionTokens: { 'http://old:18000': 'old-session' },
        serverPasswords: { 'http://old:18000': 'secret' },
        token: 'secret',
        share: { game: 'old-game', user: 'old-user' },
        shares: { 'old-game': { game: 'old-game', user: 'old-user' } },
        activeShareGame: 'old-game',
        ttsRate: 2,
        ttsEngine: 'system',
        ttsAuto: false,
        hapticsEnabled: false,
        themeMode: 'light',
        language: 'ja',
      },
    }))
    await useSettingsStore.persist.rehydrate()

    const defaults = {
      baseUrl: '',
      recentBaseUrls: [],
      serverSessionTokens: {},
      serverPasswords: {},
      token: null,
      shares: {},
      activeShareGame: null,
      shareCredentials: {},
      ttsRate: 1,
      ttsEngine: 'server',
      ttsAuto: true,
      hapticsEnabled: true,
      themeMode: 'system',
      language: 'system',
    }
    expect(useSettingsStore.getState()).toMatchObject({ ...defaults, hydrated: true })
    expect(currentShare()).toBeNull()
    expect(currentToken()).toBeNull()
    // install id 只是本机库 meta 的缓存：水合时不生成，旧数据里没有就保持空串
    expect(useSettingsStore.getState().installId).toBe('')
    expect(JSON.parse((await AsyncStorage.getItem('diceframe-settings'))!)).toEqual({ version: 3, state: { ...defaults, installId: '' } })
  })

  it('v3 重新登录后的设置正常持久化，后续启动不再清空', async () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://new:18000')
    store.setToken('new-password')
    store.rememberServerPassword('http://new:18000', 'new-password')
    const identity = { game: 'new-game', user: 'new-user', name: 'Aria', delegate: 'delegate-a' }
    store.upsertShare(identity)
    store.upsertShare({ game: 'other-game', user: 'other-user' })
    store.storeSeatToken('http://new:18000', 'new-game', 'seat-a')
    store.storeRoomToken('http://new:18000', 'new-game', 'room-a')
    store.activateShare('new-game')
    store.setThemeMode('light')
    store.setLanguage('en')
    const saved = await AsyncStorage.getItem('diceframe-settings')
    const sessionToken = currentSessionToken()
    expect(JSON.parse(saved!).version).toBe(3)
    expect(JSON.parse(saved!).state).not.toHaveProperty('share')

    // 模拟后续两次启动，API 内存态清空后应从 v3 槽位恢复完整身份与服务器会话。
    for (let startup = 0; startup < 2; startup += 1) {
      useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
      configureApiClient({ baseUrl: '', token: null, share: null, sessionToken: null, credentials: {} })
      await AsyncStorage.setItem('diceframe-settings', saved!)
      await useSettingsStore.persist.rehydrate()
      expect(currentToken()).toBe('new-password')
      expect(useSettingsStore.getState()).toMatchObject({
        baseUrl: 'http://new:18000',
        serverPasswords: { 'http://new:18000': 'new-password' },
        shares: {
          'new-game': identity,
          'other-game': { game: 'other-game', user: 'other-user' },
        },
        activeShareGame: 'new-game',
        hydrated: true,
        themeMode: 'light',
        language: 'en',
      })
      expect(activeIdentityOf(useSettingsStore.getState())).toEqual(identity)
      expect(currentShare()).toEqual(identity)
      expect(currentSessionToken()).toBe(sessionToken)
      // 分享凭证随设置落盘并在启动时注入 client（仍按后端 + 局分槽）
      expect(hasSeatToken('new-game')).toBe(true)
      expect(hasRoomToken('new-game')).toBe(true)
      expect(hasSeatToken('other-game')).toBe(false)
      const sseUrl = new URL(buildPlaySseUrl('new-game', 'ticket'))
      expect(sseUrl.origin).toBe('http://new:18000')
      // 玩家模式（delegate 值不是代操作开关）：持席位凭证不再用 ?user= 指名，房主登录也一样；
      // 房间令牌只走请求头，不进 URL
      expect(Object.fromEntries(sseUrl.searchParams)).toEqual({
        game: 'new-game', name: 'Aria', share: '1',
        delegate: 'delegate-a', ticket: 'ticket',
      })
      expect(await AsyncStorage.getItem('diceframe-settings')).toBe(saved)
    }
  })
})

describe('settings store 分享凭证（席位凭证 / 房间令牌）', () => {
  beforeEach(async () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
    configureApiClient({ baseUrl: '', token: null, share: null, sessionToken: null, credentials: {} })
  })

  it('凭证按后端地址分槽：换服务器后看不到原服务器的凭证，换回来仍在', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000/')
    store.storeSeatToken('http://a:18000', 'g', ' seat-a ')
    store.storeRoomToken('http://a:18000', 'g', 'room-a')
    expect(hasSeatToken('g')).toBe(true)
    expect(useSettingsStore.getState().shareCredentials).toEqual({
      [credentialKey('http://a:18000', 'g')]: { seat: 'seat-a', room: 'room-a' },
    })

    store.setBaseUrl('http://b:18000')
    expect(hasSeatToken('g')).toBe(false)
    expect(hasRoomToken('g')).toBe(false)

    store.setBaseUrl('http://a:18000')
    expect(hasSeatToken('g')).toBe(true)
  })

  it('空凭证不覆盖已有凭证；clearShares 不清凭证，removeShare 丢掉该局席位凭证', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.storeSeatToken('http://a:18000', 'g', 'seat-a')
    store.storeSeatToken('http://a:18000', 'g', undefined)
    store.storeSeatToken('http://a:18000', 'g', '')
    expect(hasSeatToken('g')).toBe(true)

    store.upsertShare({ game: 'g', user: 'u' })
    store.clearShares()
    expect(hasSeatToken('g')).toBe(true)

    store.upsertShare({ game: 'g', user: 'u' })
    store.storeRoomToken('http://a:18000', 'g', 'room-a')
    store.removeShare('g')
    expect(hasSeatToken('g')).toBe(false)
    expect(hasRoomToken('g')).toBe(true)
  })

  it('席位凭证被拒：清该局凭证与身份并清注入，不动其他局', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.upsertShare({ game: 'other', user: 'u-o' })
    store.upsertShare({ game: 'g', user: 'u' })
    store.storeSeatToken('http://a:18000', 'g', 'seat-g')
    store.storeSeatToken('http://a:18000', 'other', 'seat-o')

    store.rejectSeatToken('http://a:18000', 'g')
    const state = useSettingsStore.getState()
    expect(state.shares).toEqual({ other: { game: 'other', user: 'u-o' } })
    expect(state.activeShareGame).toBeNull()
    expect(currentShare()).toBeNull()
    expect(hasSeatToken('g')).toBe(false)
    expect(hasSeatToken('other')).toBe(true)
  })

  it('别的后端发来的席位拒绝只清那台后端的凭证，不动当前服务器的身份', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.upsertShare({ game: 'g', user: 'u' })
    store.storeSeatToken('http://a:18000', 'g', 'seat-a')
    store.storeSeatToken('http://b:18000', 'g', 'seat-b')

    store.rejectSeatToken('http://b:18000', 'g')
    expect(useSettingsStore.getState().shares.g).toEqual({ game: 'g', user: 'u' })
    expect(hasSeatToken('g')).toBe(true)
    expect(useSettingsStore.getState().shareCredentials[credentialKey('http://b:18000', 'g')]).toBeUndefined()
  })

  it('房间令牌被拒只清令牌，身份保留', () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://a:18000')
    store.upsertShare({ game: 'g', user: 'u' })
    store.storeRoomToken('http://a:18000', 'g', 'room')
    store.rejectRoomToken('http://a:18000', 'g')
    expect(hasRoomToken('g')).toBe(false)
    expect(currentShare()).toEqual({ game: 'g', user: 'u' })
  })

  it('旧版身份里的 roomToken 挪进凭证表并从身份中抹掉', () => {
    const legacy = {
      a: { game: 'a', user: 'u-a', roomToken: 'room-a' },
      b: { game: 'b', user: 'u-b' },
    }
    const adopted = adoptLegacyRoomTokens(legacy, {}, 'http://A:18000/')
    expect(adopted.shares).toEqual({ a: { game: 'a', user: 'u-a' }, b: legacy.b })
    expect(adopted.credentials).toEqual({ [credentialKey('http://a:18000', 'a')]: { room: 'room-a' } })

    const clean = { b: { game: 'b', user: 'u-b' } }
    const untouched = adoptLegacyRoomTokens(clean, {}, 'http://a:18000')
    expect(untouched.shares).toBe(clean)
  })

  it('启动时迁移旧 roomToken：之后只以请求头发送，不再拼进 URL', async () => {
    await AsyncStorage.setItem('diceframe-settings', JSON.stringify({
      version: 3,
      state: {
        baseUrl: 'http://a:18000',
        serverSessionTokens: { 'http://a:18000': 'f'.repeat(32) },
        shares: { g: { game: 'g', user: 'u', roomToken: 'legacy-room' } },
        activeShareGame: 'g',
      },
    }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().shares.g).toEqual({ game: 'g', user: 'u' })
    expect(hasRoomToken('g')).toBe(true)

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    await api('/games/g/log')
    const [url, init] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.has('room_token')).toBe(false)
    expect(new Headers(init.headers).get('X-Room-Token')).toBe('legacy-room')
  })
})

describe('settings store install id 缓存', () => {
  it('水合时从不生成 install id：缓存只由本机库 meta 经 resolveInstallId 回写', async () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
    await AsyncStorage.setItem('diceframe-settings', JSON.stringify({ version: 3, state: { baseUrl: '' } }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().installId).toBe('')
  })

  it('已缓存的值原样恢复（即使不合法也不在这里修正，修正是 meta 的事）', async () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
    await AsyncStorage.setItem('diceframe-settings', JSON.stringify({ version: 3, state: { installId: 'cached-id' } }))
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().installId).toBe('cached-id')
  })
})

describe('评审修复：settings 里的 install id 缓存', () => {
  it('settings 结构升级（migrate）保留已有的 install id', async () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
    const migrate = useSettingsStore.persist.getOptions().migrate!
    const migrated = await migrate({ installId: 'kept-install-id', token: 'old' }, 2) as { installId: string; token: unknown }
    expect(migrated.installId).toBe('kept-install-id')
    expect(migrated.token).toBeNull()
  })

})
