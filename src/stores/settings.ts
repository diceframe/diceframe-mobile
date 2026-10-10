import AsyncStorage from '@react-native-async-storage/async-storage'
import { randomUUID } from 'expo-crypto'
import { Appearance, Platform } from 'react-native'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  configureApiClient,
  generateSessionToken,
  normalizeBaseUrl,
} from '@/api/client'
import {
  removeIdentity,
  resolveActiveIdentity,
  upsertIdentity,
  type IdentitySlots,
  type PlayerIdentity,
} from '@/lib/player-identity'
import { ensureInstallId } from '@/lib/local-library/ids'
import type { LocalePreference } from '@/lib/locale'
import { updateRecentServers } from '@/lib/recent-servers'
import {
  withRoomToken,
  withSeatToken,
  withoutRoomToken,
  withoutSeatToken,
  type CredentialSlots,
} from '@/lib/seat-credentials'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** 朗读引擎：server = 服务器合成（对齐 Web），system = 设备自带 TTS（expo-speech） */
export type TtsEngine = 'server' | 'system'

/** persist 落盘形状（不含运行时状态与各 action） */
interface PersistedSettings {
  baseUrl: string
  recentBaseUrls: string[]
  serverSessionTokens: Record<string, string>
  /** 服务器密码本：各服务器的访问密码存本机，一键切换时免重输（见 rememberServerPassword） */
  serverPasswords: Record<string, string>
  token: string | null
  shares: IdentitySlots
  activeShareGame: string | null
  shareCredentials: CredentialSlots
  installId: string
  ttsRate: number
  ttsEngine: TtsEngine
  ttsAuto: boolean
  hapticsEnabled: boolean
  themeMode: ThemeMode
  language: LocalePreference
}

/**
 * settings 里的 install id 缓存：生成失败（Web 非安全上下文没有 crypto.randomUUID）
 * 时返回空串而不是抛出——这里抛错会卡死水合、整个 App 停在启动页。
 * 权威值在本机内容库的 meta 表里（stores/local-library.ts 的 resolveInstallId）。
 */
export function safeInstallId(stored: unknown, uuid: () => string): string {
  try {
    return ensureInstallId(stored, uuid)
  } catch {
    return ''
  }
}

/** 新安装与数据版本重置使用同一套默认值，不转换旧数据。 */
function defaultSettings(): PersistedSettings {
  return {
    baseUrl: '',
    recentBaseUrls: [],
    serverSessionTokens: {},
    serverPasswords: {},
    token: null,
    shares: {},
    activeShareGame: null,
    shareCredentials: {},
    installId: '',
    ttsRate: 1,
    ttsEngine: 'server',
    ttsAuto: true,
    hapticsEnabled: true,
    themeMode: 'system',
    language: 'system',
  }
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
  /** 服务器密码本：baseUrl → 访问密码（仅存非空密码），供服务器页一键切换 */
  serverPasswords: Record<string, string>
  /** Owner 访问密码（Bearer token）；null 表示未登录 */
  token: string | null
  /** 玩家身份槽位，按 gameKey 一局一份（多局并行，加入不再互相覆盖） */
  shares: IdentitySlots
  /** 当前注入 api client 的身份对应的 gameKey；null 表示纯 Owner/大厅请求 */
  activeShareGame: string | null
  /**
   * 分享凭证（席位凭证 / 房间令牌），按「后端地址 + gameKey」分槽（lib/seat-credentials）。
   * 不随 clearShares 清空：换服务器再换回来时凭证仍属于原服务器，且只会发给原服务器。
   */
  shareCredentials: CredentialSlots
  /**
   * 本安装的 install id（内容同步契约的 device source id）的**缓存**。权威值存在本机
   * 内容库（SQLite meta 表），与内容、映射同生共死；同步前一律经 resolveInstallId 取。
   * 不是凭证（服务端设备列表会公开显示它）。Web 端不生成（没有本机库），可能为空串。
   */
  installId: string
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
  /**
   * 密码本写入：password 非空 = 记录/更新该服务器的访问密码；
   * 空 = 移除记录（服务器改为免密或密码语义失效时保持密码本真实）
   */
  rememberServerPassword: (url: string, password: string) => void
  setToken: (token: string | null) => void
  /** 写入/更新一局身份并设为当前注入（join 成功路径） */
  upsertShare: (identity: PlayerIdentity) => void
  /** 只移除某一局的身份；若它正被注入则同时清空注入（被踢/身份失效路径） */
  removeShare: (gameKey: string) => void
  /** 切换当前注入的身份槽位；null = 清空注入（启动分流进大厅） */
  activateShare: (gameKey: string | null) => void
  /** 清空全部玩家身份（换服务器/Owner 登录时旧身份一律作废） */
  clearShares: () => void
  /** 保存席位凭证（POST /players 新建席位、GM 接管链接 seat=、claim 换得）；空值忽略 */
  storeSeatToken: (baseUrl: string, gameKey: string, token: unknown) => void
  /** 保存房间令牌（verify-room-password 换得）；空值忽略 */
  storeRoomToken: (baseUrl: string, gameKey: string, token: unknown) => void
  /** 服务端拒绝席位凭证（SEAT_TOKEN_INVALID）：清凭证与该局身份，只影响这台后端上的这一局 */
  rejectSeatToken: (baseUrl: string, gameKey: string) => void
  /** 服务端拒绝房间令牌（needs_room_password）：只清令牌，身份保留，重输房间密码即可继续 */
  rejectRoomToken: (baseUrl: string, gameKey: string) => void
  setTtsRate: (rate: number) => void
  setTtsEngine: (engine: TtsEngine) => void
  setTtsAuto: (enabled: boolean) => void
  setHapticsEnabled: (enabled: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setLanguage: (language: LocalePreference) => void
  setSystemTheme: (theme: ResolvedTheme) => void
  markHydrated: () => void
}

export function activeIdentityOf(
  state: Pick<SettingsState, 'shares' | 'activeShareGame'>,
): PlayerIdentity | null {
  return resolveActiveIdentity(state.shares, state.activeShareGame)
}

function syncApiClient(
  state: Pick<SettingsState, 'baseUrl' | 'serverSessionTokens' | 'token' | 'shares' | 'activeShareGame' | 'shareCredentials'>,
): void {
  const baseUrl = normalizeBaseUrl(state.baseUrl)
  configureApiClient({
    baseUrl,
    sessionToken: baseUrl ? state.serverSessionTokens[baseUrl] ?? null : null,
    token: state.token,
    share: activeIdentityOf(state),
    credentials: state.shareCredentials ?? {},
  })
}

/**
 * 旧版本把房间令牌放在身份槽位的 roomToken 字段并拼进 URL。新契约只认请求头：
 * 把它挪进按后端分槽的凭证表（服务端升级时会保留旧令牌的有效期），并从身份里抹掉，
 * 明文不再留在会展示/遍历的身份数据里。纯函数，便于单测。
 */
export function adoptLegacyRoomTokens(
  shares: IdentitySlots,
  credentials: CredentialSlots,
  baseUrl: string,
): { shares: IdentitySlots; credentials: CredentialSlots } {
  let nextShares = shares
  let nextCredentials = credentials
  const server = normalizeBaseUrl(baseUrl)
  for (const [gameKey, identity] of Object.entries(shares)) {
    const legacy = identity as PlayerIdentity & { roomToken?: unknown }
    if (!('roomToken' in legacy)) continue
    const { roomToken, ...rest } = legacy
    nextCredentials = withRoomToken(nextCredentials, server, gameKey, roomToken)
    nextShares = { ...nextShares, [gameKey]: rest }
  }
  return { shares: nextShares, credentials: nextCredentials }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings(),
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
          // 忘掉服务器 = 连它的密码一起忘掉，密码本不留孤儿条目
          const serverPasswords = { ...state.serverPasswords }
          delete serverPasswords[target]
          return {
            recentBaseUrls: state.recentBaseUrls.filter((item) => item !== target),
            serverSessionTokens,
            serverPasswords,
          }
        })
      },
      rememberServerPassword: (url, password) => {
        const target = normalizeBaseUrl(url)
        if (!target) return
        set((state) => {
          if (!password) {
            if (!state.serverPasswords[target]) return state
            const serverPasswords = { ...state.serverPasswords }
            delete serverPasswords[target]
            return { serverPasswords }
          }
          if (state.serverPasswords[target] === password) return state
          return { serverPasswords: { ...state.serverPasswords, [target]: password } }
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
        set({ shares, activeShareGame: identity.game })
        syncApiClient(get())
      },
      removeShare: (gameKey) => {
        const shares = removeIdentity(get().shares, gameKey)
        // 被移除的正是当前注入身份时必须同步清注入，否则后续请求还带旧 share query
        const clearing = get().activeShareGame === gameKey
        // 离开/被踢 = 放弃这一局的席位：席位凭证一并丢掉，免得下次加入被自动认回旧席位
        const shareCredentials = withoutSeatToken(get().shareCredentials, get().baseUrl, gameKey)
        set(clearing ? { shares, shareCredentials, activeShareGame: null } : { shares, shareCredentials })
        syncApiClient(get())
      },
      activateShare: (gameKey) => {
        const shares = get().shares
        const share = resolveActiveIdentity(shares, gameKey)
        // 槽位缺失（悬挂 key）时按无身份处理，不持久化无效 active 指向
        set({ activeShareGame: share ? gameKey : null })
        syncApiClient(get())
      },
      clearShares: () => {
        set({ shares: {}, activeShareGame: null })
        syncApiClient(get())
      },
      storeSeatToken: (baseUrl, gameKey, token) => {
        const shareCredentials = withSeatToken(get().shareCredentials, normalizeBaseUrl(baseUrl), gameKey, token)
        if (shareCredentials === get().shareCredentials) return
        set({ shareCredentials })
        syncApiClient(get())
      },
      storeRoomToken: (baseUrl, gameKey, token) => {
        const shareCredentials = withRoomToken(get().shareCredentials, normalizeBaseUrl(baseUrl), gameKey, token)
        if (shareCredentials === get().shareCredentials) return
        set({ shareCredentials })
        syncApiClient(get())
      },
      rejectSeatToken: (baseUrl, gameKey) => {
        const target = normalizeBaseUrl(baseUrl)
        const shareCredentials = withoutSeatToken(get().shareCredentials, target, gameKey)
        // 身份槽位只属于当前服务器（换服务器时 clearShares），别的后端发来的拒绝不动它
        if (target !== get().baseUrl) {
          set({ shareCredentials })
          syncApiClient(get())
          return
        }
        const shares = removeIdentity(get().shares, gameKey)
        const clearing = get().activeShareGame === gameKey
        set(clearing ? { shares, shareCredentials, activeShareGame: null } : { shares, shareCredentials })
        syncApiClient(get())
      },
      rejectRoomToken: (baseUrl, gameKey) => {
        const shareCredentials = withoutRoomToken(get().shareCredentials, normalizeBaseUrl(baseUrl), gameKey)
        if (shareCredentials === get().shareCredentials) return
        set({ shareCredentials })
        syncApiClient(get())
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
      // v3 不兼容旧数据：升级后清空全部本地设置，重新连接服务器。
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        recentBaseUrls: state.recentBaseUrls,
        serverSessionTokens: state.serverSessionTokens,
        serverPasswords: state.serverPasswords,
        token: state.token,
        shares: state.shares,
        activeShareGame: state.activeShareGame,
        shareCredentials: state.shareCredentials,
        installId: state.installId,
        ttsRate: state.ttsRate,
        ttsEngine: state.ttsEngine,
        ttsAuto: state.ttsAuto,
        hapticsEnabled: state.hapticsEnabled,
        themeMode: state.themeMode,
        language: state.language,
      }),
      // 结构升级照旧重置设置，但保留 install id 缓存（双保险；权威值在本机库里）
      migrate: (persisted) => {
        const installId = (persisted as { installId?: unknown } | null)?.installId
        return { ...defaultSettings(), installId: typeof installId === 'string' ? installId : '' }
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          const adopted = adoptLegacyRoomTokens(state.shares ?? {}, state.shareCredentials ?? {}, state.baseUrl)
          if (adopted.shares !== state.shares || adopted.credentials !== state.shareCredentials) {
            useSettingsStore.setState({ shares: adopted.shares, shareCredentials: adopted.credentials })
          }
          if (Platform.OS !== 'web') {
            const installId = safeInstallId(state.installId, randomUUID)
            if (installId && installId !== state.installId) useSettingsStore.setState({ installId })
          }
          syncApiClient(useSettingsStore.getState())
          state.markHydrated()
        }
      },
    },
  ),
)
