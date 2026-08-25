import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  beforeEach(() => {
    useSettingsStore.setState({ baseUrl: '', token: null, share: null })
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
})
