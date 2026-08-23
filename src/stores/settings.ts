import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  configureApiClient,
  currentSessionToken,
  generateSessionToken,
  normalizeBaseUrl,
  type ShareIdentity,
} from '@/api/client'

const SESSION_KEY = 'diceframe-session'

/**
 * 启动时恢复/生成自管理的会话 token（跨重启保持身份稳定）。
 * RN 读不到 set-cookie，token 由客户端生成并持久化，请求时主动携带。
 */
export async function bootstrapSession(): Promise<void> {
  let token = await AsyncStorage.getItem(SESSION_KEY)
  if (!token) {
    token = currentSessionToken() ?? generateSessionToken()
    await AsyncStorage.setItem(SESSION_KEY, token)
  }
  configureApiClient({ sessionToken: token })
}

interface SettingsState {
  /** 服务器地址，如 http://192.168.1.5:18000 */
  baseUrl: string
  /** Owner 访问密码（Bearer token）；null 表示未登录 */
  token: string | null
  /** 玩家分享身份（加入链接解析而来）；null 表示非玩家模式 */
  share: ShareIdentity | null
  /** TTS 播放速率（对齐 Web localStorage trpg_tts_rate） */
  ttsRate: number
  hydrated: boolean
  setBaseUrl: (url: string) => void
  setToken: (token: string | null) => void
  setShare: (share: ShareIdentity | null) => void
  setTtsRate: (rate: number) => void
  markHydrated: () => void
}

function syncApiClient(state: Pick<SettingsState, 'baseUrl' | 'token' | 'share'>): void {
  configureApiClient({
    baseUrl: normalizeBaseUrl(state.baseUrl),
    token: state.token,
    share: state.share,
  })
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      baseUrl: '',
      token: null,
      share: null,
      ttsRate: 1,
      hydrated: false,
      setBaseUrl: (url) => {
        set({ baseUrl: normalizeBaseUrl(url) })
        syncApiClient(get())
      },
      setToken: (token) => {
        set({ token })
        syncApiClient(get())
      },
      setShare: (share) => {
        set({ share })
        syncApiClient(get())
      },
      setTtsRate: (rate) => set({ ttsRate: rate }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'diceframe-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          syncApiClient(state)
          state.markHydrated()
        }
      },
    },
  ),
)
