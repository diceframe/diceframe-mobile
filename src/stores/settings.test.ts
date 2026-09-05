import { beforeEach, describe, expect, it, vi } from 'vitest'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { configureApiClient, currentToken, normalizeBaseUrl } from '@/api/client'
import { readThemeToken, resolveTheme } from '@/lib/theme'
import { useSettingsStore } from './settings'

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
      share: null,
    })
    configureApiClient({ baseUrl: '', token: null, share: null })
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
    store.setShare({ game: 'g', user: 'u1' })

    store.setBaseUrl('http://b:18000')
    useSettingsStore.getState().setToken(null)
    useSettingsStore.getState().setShare(null)

    const state = useSettingsStore.getState()
    expect(state.baseUrl).toBe('http://b:18000')
    expect(state.token).toBeNull()
    expect(state.share).toBeNull()
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
      ttsRate: 1,
      ttsEngine: 'server',
      ttsAuto: true,
      hapticsEnabled: true,
      themeMode: 'system',
      language: 'system',
    }
    expect(useSettingsStore.getState()).toMatchObject({ ...defaults, share: null, hydrated: true })
    expect(currentToken()).toBeNull()
    expect(JSON.parse((await AsyncStorage.getItem('diceframe-settings'))!)).toEqual({ version: 3, state: defaults })
  })

  it('v3 重新登录后的设置正常持久化，后续启动不再清空', async () => {
    const store = useSettingsStore.getState()
    store.setBaseUrl('http://new:18000')
    store.setToken('new-password')
    store.rememberServerPassword('http://new:18000', 'new-password')
    store.upsertShare({ game: 'new-game', user: 'new-user' })
    store.setThemeMode('light')
    store.setLanguage('en')
    const saved = await AsyncStorage.getItem('diceframe-settings')

    // 模拟后续两次启动从磁盘恢复，确保重置只发生在旧数据版本上。
    for (let startup = 0; startup < 2; startup += 1) {
      useSettingsStore.setState({ ...useSettingsStore.getInitialState() })
      await AsyncStorage.setItem('diceframe-settings', saved!)
      await useSettingsStore.persist.rehydrate()
      expect(currentToken()).toBe('new-password')
      expect(useSettingsStore.getState()).toMatchObject({
        baseUrl: 'http://new:18000',
        serverPasswords: { 'http://new:18000': 'new-password' },
        shares: { 'new-game': { game: 'new-game', user: 'new-user' } },
        themeMode: 'light',
        language: 'en',
      })
      expect(await AsyncStorage.getItem('diceframe-settings')).toBe(saved)
    }
  })
})
