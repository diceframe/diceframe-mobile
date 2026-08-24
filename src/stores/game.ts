/**
 * 对局状态 store（职责镜像 Web composables/useGame.ts）。
 *
 * - refresh() 并行拉取 detail/characters/log/private-log/map（SSE 只做变更信号）
 * - SSE：narration_delta 累积为 liveNarration（"GM 思考中"流式气泡），
 *   其余事件合并后触发完整刷新；游标随事件更新，断线重连时带回服务端
 * - 身份判定：client 上下文中存在匹配本局的分享身份 → 玩家模式；否则 GM 模式
 * - 切到后台暂停连接，回到前台刷新并恢复 SSE，避免后台持续轮询耗电
 */
import { create } from 'zustand'

import { currentShare, errorMessage, fetchAppConfig } from '@/api/client'
import {
  advanceGame,
  claimGm,
  fetchCharacters,
  fetchGameDetail,
  fetchLog,
  fetchMap,
  fetchPrivateLog,
  gmCommand,
  resolveLuck,
  rollbackGame,
  submitAction,
} from '@/api/games'
import type {
  GameDetail,
  LogEntry,
  MapData,
  Player,
  PrivateMessage,
  RuleAttribute,
  RuleMeta,
} from '@/api/types'
import {
  createGameStream,
  type GameSseEffect,
  type GameSsePayload,
  type GameStream,
  type StreamStatus,
} from '@/stream/gameStream'
import { hasNewRound } from '@/lib/game-state'

interface GameStore {
  gameKey: string
  userId: string
  isGm: boolean
  loading: boolean
  error: string
  detail: GameDetail | null
  players: Player[]
  ruleMeta: RuleMeta | null
  ruleAttrs: RuleAttribute[]
  log: LogEntry[]
  logPage: number
  logTotalPages: number
  privateMessages: PrivateMessage[]
  map: MapData | null
  liveNarration: string
  cursor: string
  streamStatus: StreamStatus
  asrEnabled: boolean
  ttsEnabled: boolean
  actionBusy: boolean

  enter: (gameKey: string) => void
  leave: () => void
  pause: () => void
  resume: () => void
  refresh: () => Promise<void>
  loadOlderLog: () => Promise<void>
  submit: (text: string) => Promise<void>
  decideLuck: (checkId: string, spend: boolean) => Promise<void>
  advance: () => Promise<void>
  rollback: () => Promise<void>
  command: (text: string) => Promise<void>
}

const initial = {
  gameKey: '',
  userId: '',
  isGm: false,
  loading: false,
  error: '',
  detail: null,
  players: [],
  ruleMeta: null,
  ruleAttrs: [],
  log: [],
  logPage: 1,
  logTotalPages: 1,
  privateMessages: [],
  map: null,
  liveNarration: '',
  cursor: '',
  streamStatus: 'idle',
  asrEnabled: false,
  ttsEnabled: false,
  actionBusy: false,
} satisfies Partial<GameStore>

export const useGameStore = create<GameStore>((set, get) => {
  let stream: GameStream | null = null
  let connectionVersion = 0
  let refreshVersion = 0
  let suspended = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  function isCurrent(gameKey: string, version: number): boolean {
    return connectionVersion === version && get().gameKey === gameKey
  }

  function stopStream() {
    stream?.stop()
    stream = null
  }

  function clearRefreshTimer() {
    if (!refreshTimer) return
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  function scheduleRefresh(gameKey: string, version: number) {
    clearRefreshTimer()
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      if (isCurrent(gameKey, version) && !suspended) void get().refresh()
    }, 120)
  }

  function startStream(gameKey: string, version: number) {
    if (!isCurrent(gameKey, version) || suspended) return
    stopStream()
    stream = createGameStream(
      gameKey,
      () => get().cursor,
      {
        onEvent: (effect: GameSseEffect, payload: GameSsePayload, cursor: string) => {
          if (!isCurrent(gameKey, version) || suspended) return
          if (effect === 'narration-delta') {
            set({ cursor, liveNarration: get().liveNarration + (payload.text ?? '') })
            return
          }
          if (effect === 'narration-reset') {
            set({ cursor, liveNarration: '' })
            return
          }
          if (effect === 'baseline') {
            set({ cursor })
            return
          }
          set({ cursor })
          scheduleRefresh(gameKey, version)
        },
        onStatusChange: (status: StreamStatus) => {
          if (isCurrent(gameKey, version) && !suspended) set({ streamStatus: status })
        },
        onError: (message) => {
          if (isCurrent(gameKey, version) && !suspended && message) set({ error: message })
        },
      },
    )
    stream.start()
  }

  async function connect(gameKey: string, isPlayer: boolean, version: number) {
    try {
      const config = await fetchAppConfig()
      if (isCurrent(gameKey, version) && !suspended) {
        set({
          asrEnabled: config.asr_provider === 'openai-compatible' && !!config.asr_base_url,
          ttsEnabled: !!config.tts_provider && config.tts_provider !== 'browser',
        })
      }
    } catch {
      // 配置拉不到时保持语音功能隐藏即可
    }

    // Owner 在新设备登录后，会话 uid 是全新的、不在存档玩家列表里，
    // 直接订阅 SSE 会 403「未加入本局」。先 claim-gm 把当前会话
    // 绑定为存档 GM 身份（对齐 Web loadPlayContext 的做法）。
    if (!isPlayer) {
      try {
        const gmUid = await claimGm(gameKey)
        if (gmUid && isCurrent(gameKey, version) && !suspended) set({ userId: gmUid })
      } catch {
        // 404=存档没有可恢复的 GM 身份（纯玩家分享局）；其余失败不阻断入局
      }
    }

    if (!isCurrent(gameKey, version) || suspended) return
    await get().refresh()
    startStream(gameKey, version)
  }

  return {
    ...initial,

    enter(gameKey) {
      const share = currentShare()
      const isPlayer = !!share && share.game === gameKey
      connectionVersion += 1
      refreshVersion += 1
      suspended = false
      clearRefreshTimer()
      stopStream()
      set({ ...initial, gameKey, userId: isPlayer ? share!.user : '', isGm: !isPlayer })
      void connect(gameKey, isPlayer, connectionVersion)
    },

    leave() {
      connectionVersion += 1
      refreshVersion += 1
      suspended = false
      clearRefreshTimer()
      stopStream()
      set({ ...initial })
    },

    pause() {
      if (!get().gameKey) return
      connectionVersion += 1
      refreshVersion += 1
      suspended = true
      clearRefreshTimer()
      stopStream()
      set({ streamStatus: 'idle' })
    },

    resume() {
      const { gameKey, isGm } = get()
      if (!gameKey || !suspended) return
      connectionVersion += 1
      suspended = false
      void connect(gameKey, !isGm, connectionVersion)
    },

    async refresh() {
      const { gameKey, log: previousLog } = get()
      if (!gameKey) return
      const requestVersion = ++refreshVersion
      set({ loading: true })
      try {
        const [detail, characters, log, privateLog, map] = await Promise.all([
          fetchGameDetail(gameKey),
          fetchCharacters(gameKey),
          fetchLog(gameKey),
          fetchPrivateLog(gameKey),
          fetchMap(gameKey),
        ])
        if (get().gameKey !== gameKey || requestVersion !== refreshVersion) return
        const newLog = log.log ?? []
        // 新回合写入 log 时清掉上一轮的流式气泡，避免“思考中”与正式输出重复。
        // 第一页满员后长度不再增长，须按最新条目的 round 判断。
        const clearNarration = hasNewRound(previousLog, newLog)
        set({
          detail,
          players: characters.players ?? [],
          ruleMeta: characters.rule_meta ?? null,
          ruleAttrs: characters.rule_attrs ?? [],
          log: newLog,
          logPage: 1,
          logTotalPages: log.total_pages ?? 1,
          privateMessages: privateLog.messages ?? privateLog.private_log ?? [],
          map,
          error: '',
          loading: false,
          liveNarration: clearNarration ? '' : get().liveNarration,
        })
      } catch (error) {
        if (get().gameKey === gameKey && requestVersion === refreshVersion) {
          set({ error: errorMessage(error), loading: false })
        }
      }
    },

    async loadOlderLog() {
      const { gameKey, logPage, logTotalPages } = get()
      if (!gameKey || logPage >= logTotalPages) return
      const nextPage = logPage + 1
      try {
        const result = await fetchLog(gameKey, nextPage)
        if (get().gameKey !== gameKey || get().logPage !== logPage) return
        set({
          log: [...(result.log ?? []), ...get().log],
          logPage: nextPage,
          logTotalPages: result.total_pages ?? logTotalPages,
        })
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
      }
    },

    async submit(text) {
      const { gameKey } = get()
      if (!gameKey || !text.trim()) return
      set({ actionBusy: true })
      try {
        await submitAction(gameKey, text.trim())
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ actionBusy: false })
      }
    },

    async decideLuck(checkId, spend) {
      const { gameKey } = get()
      if (!gameKey) return
      try {
        await resolveLuck(gameKey, checkId, spend)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      }
    },

    async advance() {
      const { gameKey } = get()
      if (!gameKey) return
      await advanceGame(gameKey)
      if (get().gameKey === gameKey) await get().refresh()
    },

    async rollback() {
      const { gameKey } = get()
      if (!gameKey) return
      await rollbackGame(gameKey)
      if (get().gameKey === gameKey) await get().refresh()
    },

    async command(text) {
      const { gameKey } = get()
      if (!gameKey || !text.trim()) return
      await gmCommand(gameKey, text.trim())
      if (get().gameKey === gameKey) await get().refresh()
    },
  }
})

/** 当前用户角色卡（玩家模式） */
export function selectMySheet(state: GameStore) {
  if (!state.userId) return null
  return state.players.find((player) => player.user_id === state.userId)?.character_sheet ?? null
}

/** “GM 思考中”：判定阶段 或 正在流式输出 */
export function selectGmThinking(state: GameStore) {
  return state.detail?.state === 'active_judgment' || state.liveNarration.length > 0
}
