/**
 * 对局状态 store（职责镜像 Web composables/useGame.ts）。
 *
 * - refresh() 并行拉取 detail/characters/log/private-log/map（SSE 只做变更信号）
 * - SSE：narration_delta 累积为 liveNarration（"GM 思考中"流式气泡），
 *   其余事件触发完整刷新；游标随事件更新，断线重连时带回服务端
 * - 身份判定：client 上下文中存在匹配本局的分享身份 → 玩家模式；否则 GM 模式
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
import { createGameStream, type GameSseEffect, type GameSsePayload, type GameStream, type StreamStatus } from '@/stream/gameStream'

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
  refresh: () => Promise<void>
  loadOlderLog: () => Promise<void>
  submit: (text: string) => Promise<void>
  decideLuck: (checkId: string, spend: boolean) => Promise<void>
  advance: () => Promise<void>
  rollback: () => Promise<void>
  command: (text: string) => Promise<void>
}

let stream: GameStream | null = null

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

export const useGameStore = create<GameStore>((set, get) => ({
  ...initial,

  enter(gameKey) {
    const share = currentShare()
    const isPlayer = !!share && share.game === gameKey
    stream?.stop()
    stream = null
    set({ ...initial, gameKey, userId: isPlayer ? share!.user : '', isGm: !isPlayer })

    void (async () => {
      try {
        const config = await fetchAppConfig()
        set({
          asrEnabled: config.asr_provider === 'openai-compatible' && !!config.asr_base_url,
          ttsEnabled: !!config.tts_provider && config.tts_provider !== 'browser',
        })
      } catch {
        // 配置拉不到时保持语音功能隐藏即可
      }

      // Owner 在新设备登录后，会话 uid 是全新的、不在存档玩家列表里，
      // 直接订阅 SSE 会 403「未加入本局」。先 claim-gm 把当前会话
      // 绑定为存档 GM 身份（对齐 Web loadPlayContext 的做法），
      // 后续请求（含 SSE 票据）以 gm_uid 识别。
      if (!isPlayer) {
        try {
          const gmUid = await claimGm(gameKey)
          if (gmUid) set({ userId: gmUid })
        } catch {
          // 404=存档没有可恢复的 GM 身份（纯玩家分享局）；其余失败不阻断入局
        }
      }

      await get().refresh()

      stream = createGameStream(
        gameKey,
        () => get().cursor,
        {
          onEvent: (effect: GameSseEffect, payload: GameSsePayload, cursor: string) => {
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
            void get().refresh()
          },
          onStatusChange: (status: StreamStatus) => set({ streamStatus: status }),
          onError: (message) => {
            // 票据获取失败（如身份失效 403）需要可见，而不是只在状态徽标里降级
            if (message) set({ error: message })
          },
        },
      )
      stream.start()
    })()
  },

  leave() {
    stream?.stop()
    stream = null
    set({ ...initial })
  },

  async refresh() {
    const { gameKey, log: previousLog } = get()
    if (!gameKey) return
    set({ loading: true })
    try {
      const [detail, characters, log, privateLog, map] = await Promise.all([
        fetchGameDetail(gameKey),
        fetchCharacters(gameKey),
        fetchLog(gameKey),
        fetchPrivateLog(gameKey),
        fetchMap(gameKey),
      ])
      const newLog = log.log ?? []
      // 新回合写入 log 时清掉上一轮的流式气泡，避免头部"思考中"与列表结果重复
      // （对齐 Web useGame.ts 的 watch(log.length) 逻辑）
      const clearNarration = newLog.length > previousLog.length
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
      set({ error: errorMessage(error), loading: false })
    }
  },

  async loadOlderLog() {
    const { gameKey, logPage, logTotalPages } = get()
    if (!gameKey || logPage >= logTotalPages) return
    const nextPage = logPage + 1
    const result = await fetchLog(gameKey, nextPage)
    set({
      log: [...(result.log ?? []), ...get().log],
      logPage: nextPage,
      logTotalPages: result.total_pages ?? logTotalPages,
    })
  },

  async submit(text) {
    const { gameKey } = get()
    if (!gameKey || !text.trim()) return
    set({ actionBusy: true })
    try {
      await submitAction(gameKey, text.trim())
      await get().refresh()
    } finally {
      set({ actionBusy: false })
    }
  },

  async decideLuck(checkId, spend) {
    const { gameKey } = get()
    if (!gameKey) return
    await resolveLuck(gameKey, checkId, spend)
    await get().refresh()
  },

  async advance() {
    const { gameKey } = get()
    if (!gameKey) return
    await advanceGame(gameKey)
    await get().refresh()
  },

  async rollback() {
    const { gameKey } = get()
    if (!gameKey) return
    await rollbackGame(gameKey)
    await get().refresh()
  },

  async command(text) {
    const { gameKey } = get()
    if (!gameKey || !text.trim()) return
    await gmCommand(gameKey, text.trim())
    await get().refresh()
  },
}))

/** 当前用户角色卡（玩家模式） */
export function selectMySheet(state: GameStore) {
  if (!state.userId) return null
  return state.players.find((player) => player.user_id === state.userId)?.character_sheet ?? null
}

/** "GM 思考中"：判定阶段 或 正在流式输出 */
export function selectGmThinking(state: GameStore) {
  return state.detail?.state === 'active_judgment' || state.liveNarration.length > 0
}
