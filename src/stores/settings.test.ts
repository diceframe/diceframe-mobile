import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient, currentToken, normalizeBaseUrl } from '@/api/client'
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

describe('settings store 登录/登出状态机（回归：退出登录后必须能重新进入）', () => {
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
