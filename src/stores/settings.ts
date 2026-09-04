import AsyncStorage from '@react-native-async-storage/async-storage'
import { Appearance } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  configureApiClient,
  generateSessionToken,
  normalizeBaseUrl,
  type ShareIdentity,
} from '@/api/client'
import {
  removeIdentity,
  resolveActiveIdentity,
  upsertIdentity,
  type IdentitySlots,
  type PlayerIdentity,
} from '@/lib/player-identity'
import type { LocalePreference } from '@/lib/locale'
import { updateRecentServers } from '@/lib/recent-servers'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** 朗读引擎：server = 服务器合成（对齐 Web），system = 设备自带 TTS（expo-speech） */
export type TtsEngine = 'server' | 'system'

/** persist 落盘形状（不含运行时派生字段 share 与各 action） */
interface PersistedSettings {
  baseUrl: string
  recentBaseUrls: string[]
  serverSessionTokens: Record<string, string>
  token: string | null
  shares: IdentitySlots
  activeShareGame: string | null
  ttsRate: number
  ttsEngine: TtsEngine
  ttsAuto: boolean
  hapticsEnabled: boolean
  themeMode: ThemeMode
  language: LocalePreference
}

function systemTheme(): ResolvedTheme {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
}

interface SettingsState {
  /** 服务器地址，如 http://192.168.1.5:18000 */
  baseUrl: string
  /** 已验证成功的最近服务器地址，按最近使用排序；不包含密码或玩家凭据 */
  recentBaseUrls: string[]
  /** 每台服务器独立的原生会话，防止跨实例串用 claim-gm/rebind 身份 */
  serverSessionTokens: Record<string, string>
  /** Owner 访问密码（Bearer token）；null 表示未登录 */
  token: string | null
  /** 玩家身份槽位，按 gameKey 一局一份（多局并行，加入不再互相覆盖） */
  shares: IdentitySlots
  /** 当前注入 api client 的身份对应的 gameKey；null 表示纯 Owner/大厅请求 */
  activeShareGame: string | null
  /**
   * 运行时派生冗余：= shares[activeShareGame]（不落盘）。
   * 保留字段名是为了兼容既有消费方（login 的 setShare(null)、profile 摘要行），
   * 语义已从「全局唯一身份」收窄为「当前注入的那一份」。
   */
  share: ShareIdentity | null
  /** TTS 播放速率（对齐 Web localStorage trpg_tts_rate） */
  ttsRate: number
  /** 朗读引擎；server 引擎不可用时对局页会整体隐藏朗读入口 */
  ttsEngine: TtsEngine
  /** 新 GM 叙事到达时自动朗读；关掉后保留每条叙事的手动喇叭按钮 */
  ttsAuto: boolean
  /** 对局触觉反馈（受伤/骰子等事件震动）；纯移动端体验，Web 无对应概念 */
  hapticsEnabled: boolean
  /** 主题偏好；system 表示跟随设备主题 */
  themeMode: ThemeMode
  /** 界面语言偏好；system 表示跟随设备语言 */
  language: LocalePreference
  /** 设备当前主题，用于解析 system 偏好 */
  systemTheme: ResolvedTheme
  hydrated: boolean
  setBaseUrl: (url: string) => void
  removeRecentServer: (url: string) => void
  setToken: (token: string | null) => void
  /** 写入/更新一局身份并设为当前注入（join 成功路径） */
  upsertShare: (identity: PlayerIdentity) => void
  /** 只移除某一局的身份；若它正被注入则同时清空注入（被踢/身份失效路径） */
  removeShare: (gameKey: string) => void
  /** 切换当前注入的身份槽位；null = 清空注入（启动分流进大厅） */
  activateShare: (gameKey: string | null) => void
  /** 清空全部玩家身份（换服务器/Owner 登录时旧身份一律作废） */
  clearShares: () => void
  /**
   * 兼容旧签名（login.tsx 等既有调用方）：null = 清空全部玩家身份；
   * 非 null = upsert 单局身份。新代码请用 upsert/remove/activate。
   */
  setShare: (share: ShareIdentity | null) => void
  setTtsRate: (rate: number) => void
  setTtsEngine: (engine: TtsEngine) => void
  setTtsAuto: (enabled: boolean) => void
  setHapticsEnabled: (enabled: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setLanguage: (language: LocalePreference) => void
  setSystemTheme: (theme: ResolvedTheme) => void
  markHydrated: () => void
}

function syncApiClient(
  state: Pick<SettingsState, 'baseUrl' | 'serverSessionTokens' | 'token' | 'share'>,
): void {
  const baseUrl = normalizeBaseUrl(state.baseUrl)
  configureApiClient({
    baseUrl,
    sessionToken: baseUrl ? state.serverSessionTokens[baseUrl] ?? null : null,
    token: state.token,
    share: state.share,
  })
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      baseUrl: '',
      recentBaseUrls: [],
      serverSessionTokens: {},
      token: null,
      shares: {},
      activeShareGame: null,
      share: null,
      ttsRate: 1,
      ttsEngine: 'server',
      ttsAuto: true,
      hapticsEnabled: true,
      themeMode: 'system',
      language: 'system',
      systemTheme: systemTheme(),
      hydrated: false,
      setBaseUrl: (url) => {
        const previous = get().baseUrl
        const baseUrl = normalizeBaseUrl(url)
        set((state) => ({
          baseUrl,
          recentBaseUrls: updateRecentServers(state.recentBaseUrls, baseUrl, previous),
          serverSessionTokens: baseUrl && !state.serverSessionTokens[baseUrl]
            ? { ...state.serverSessionTokens, [baseUrl]: generateSessionToken() }
            : state.serverSessionTokens,
        }))
        syncApiClient(get())
      },
      removeRecentServer: (url) => {
        const target = normalizeBaseUrl(url)
        set((state) => {
          if (!target || target === state.baseUrl) return state
          const serverSessionTokens = { ...state.serverSessionTokens }
          delete serverSessionTokens[target]
          return {
            recentBaseUrls: state.recentBaseUrls.filter((item) => item !== target),
            serverSessionTokens,
          }
        })
      },
      setToken: (token) => {
        set({ token })
        syncApiClient(get())
      },
      upsertShare: (identity) => {
        if (!identity.game) return
        const shares = upsertIdentity(get().shares, identity)
        // 新写入的身份随即成为当前注入（join 成功后马上进对局）
        set({ shares, activeShareGame: identity.game, share: identity })
        syncApiClient(get())
      },
      removeShare: (gameKey) => {
        const shares = removeIdentity(get().shares, gameKey)
        // 被移除的正是当前注入身份时必须同步清注入，否则后续请求还带旧 share query
        const clearing = get().activeShareGame === gameKey
        const share = clearing ? null : get().share
        set(clearing ? { shares, activeShareGame: null, share } : { shares })
        syncApiClient(get())
      },
      activateShare: (gameKey) => {
        const shares = get().shares
        const share = resolveActiveIdentity(shares, gameKey)
        // 槽位缺失（悬挂 key）时按无身份处理，不持久化无效 active 指向
        set({ activeShareGame: share ? gameKey : null, share })
        syncApiClient(get())
      },
      clearShares: () => {
        set({ shares: {}, activeShareGame: null, share: null })
        syncApiClient(get())
      },
      setShare: (share) => {
        if (share) get().upsertShare(share)
        else get().clearShares()
      },
      setTtsRate: (rate) => set({ ttsRate: rate }),
      setTtsEngine: (ttsEngine) => set({ ttsEngine }),
      setTtsAuto: (ttsAuto) => set({ ttsAuto }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setLanguage: (language) => set({ language }),
      setSystemTheme: (systemTheme) => set({ systemTheme }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'diceframe-settings',
      // v2 重置旧版连接域：多服务器模型不继承单服务器凭据，升级后重新连接一次。
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        recentBaseUrls: state.recentBaseUrls,
        serverSessionTokens: state.serverSessionTokens,
        token: state.token,
        shares: state.shares,
        activeShareGame: state.activeShareGame,
        ttsRate: state.ttsRate,
        ttsEngine: state.ttsEngine,
        ttsAuto: state.ttsAuto,
        hapticsEnabled: state.hapticsEnabled,
        themeMode: state.themeMode,
        language: state.language,
      }),
      migrate: (persisted) => {
        // 多服务器切换不能沿用旧版单服务器凭据；白名单保留设备偏好，连接域重新建立。
        const saved = persisted as Partial<PersistedSettings>
        return {
          baseUrl: '',
          recentBaseUrls: [],
          serverSessionTokens: {},
          token: null,
          shares: {},
          activeShareGame: null,
          ttsRate: saved.ttsRate ?? 1,
          ttsEngine: saved.ttsEngine ?? 'server',
          ttsAuto: saved.ttsAuto ?? true,
          hapticsEnabled: saved.hapticsEnabled ?? true,
          themeMode: saved.themeMode ?? 'system',
          language: saved.language ?? 'system',
        }
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          syncApiClient(state)
          state.markHydrated()
        }
      },
    },
  ),
)
