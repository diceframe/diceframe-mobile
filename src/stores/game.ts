/**
 * 对局状态 store（职责镜像 Web composables/useGame.ts）。
 *
 * - refresh() 并行拉取 detail/characters/log/private-log/map/table-talk（SSE 只做变更信号）
 * - SSE：narration_delta 累积为 liveNarration（"GM 思考中"流式气泡），
 *   table_talk_changed 仅刷新独立频道，其余事件合并后完整刷新；游标随事件更新供重连恢复
 * - 身份判定：client 上下文中存在匹配本局的分享身份 → 玩家模式；否则 GM 模式
 * - 切到后台暂停连接，回到前台刷新并恢复 SSE，避免后台持续轮询耗电
 */
import { create } from 'zustand'

import { ApiError, buildUrl, currentSessionToken, currentShare, currentToken, errorMessage, fetchAppConfig } from '@/api/client'
import { askKpQuestion, canAskKpQuestion, fetchTableTalk, isTableTalkUnsupported, type KpQuestionVisibility } from '@/api/table-talk'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'
import { asrAvailable, serverTtsAvailable } from '@/lib/speech-config'
import {
  advanceGame,
  allocateCharacterPoints,
  claimGm,
  createPaymentProposal,
  fetchCharacters,
  fetchCharacterCards,
  fetchGameDetail,
  fetchGeneratedImages,
  fetchHealth,
  fetchLog,
  fetchMap,
  fetchPrivateLog,
  fetchWorldCandidates,
  generateStoryRecap,
  gmCommand,
  kickPlayer,
  resolveHealthEvent,
  resolveLuck,
  resolvePayment,
  resetGame,
  restartGame,
  rollbackGame,
  selectCharacterCard,
  sendPrivateMessage,
  setPlayerAccess,
  setPlayerAway,
  setSoloMode,
  submitAction,
  switchGameWorld,
  updateCharacterPortrait,
  updateRulesetCharacterProfile,
} from '@/api/games'
import type {
  CharacterCard,
  CharacterCardsResponse,
  CharacterSheet,
  CheckResult,
  GameDetail,
  GeneratedImageItem,
  HealthResponse,
  LogEntry,
  MapData,
  PendingPayment,
  PaymentProposalCreatePayload,
  PaymentResolveResponse,
  Player,
  PrivateMessage,
  RuleAttribute,
  RuleMeta,
  TableTalkExchange,
  WorldCandidate,
} from '@/api/types'
import {
  createGameStream,
  type GameSseEffect,
  type GameSsePayload,
  type GameStream,
  type StreamStatus,
} from '@/stream/gameStream'
import { hasNewRound } from '@/lib/game-state'
import { buildLevelUpAttributes } from '@/lib/level-up'
import { UserFacingError } from '@/lib/user-facing-error'
import { mergePendingLuck } from '@/lib/check-details'
import {
  economyProposalList,
  isEconomyProposalActionable,
} from '@/lib/economy-prompts'

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
  tableTalk: TableTalkExchange[]
  tableTalkSupported: boolean | null
  tableTalkLoading: boolean
  tableTalkError: string
  /** 入局/身份/重置代次，供表单 key 隔离草稿和私密回答。 */
  tableTalkRevision: number
  kpQuestionBusy: boolean
  kpQuestionAnswer: string
  kpQuestionError: string
  kpQuestionSupported: boolean | null
  refreshTableTalk: () => Promise<void>
  askKp: (question: string, visibility?: KpQuestionVisibility) => Promise<void>
  clearKpQuestion: () => void
  map: MapData | null
  liveNarration: string
  cursor: string
  streamStatus: StreamStatus
  asrEnabled: boolean
  ttsEnabled: boolean
  actionBusy: boolean
  gmBusy: boolean
  /** 翻页加载更早回合的加载态（时间线页脚转圈用） */
  loadingOlderLog: boolean
  health: HealthResponse | null

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
  // GM 工具
  storyRecap: () => Promise<void>
  toggleMode: () => Promise<void>
  toggleAccess: () => Promise<void>
  setAway: (uid: string, away: boolean) => Promise<void>
  kick: (uid: string) => Promise<void>
  privateMessage: (uid: string, text: string) => Promise<void>
  switchWorld: (worldId: string) => Promise<void>
  resetGame: () => Promise<void>
  restartGame: () => Promise<void>
  refreshHealth: () => Promise<void>
  resolveHealth: (id: string, action: 'resolve' | 'ignore') => Promise<void>
  // 角色卡 / 肖像
  fetchCharacterCards: () => Promise<CharacterCardsResponse>
  applyCharacterCard: (card: CharacterCard) => Promise<void>
  updatePortrait: (portrait: CharacterSheet['portrait']) => Promise<void>
  allocatePoints: (additions: Record<string, number>) => Promise<void>
  // 世界观候选
  fetchWorldCandidates: () => Promise<WorldCandidate[]>
  // 生成图
  fetchGeneratedImages: () => Promise<GeneratedImageItem[]>
  // 权威经济提案
  createPayment: (payload: PaymentProposalCreatePayload) => Promise<void>
  decidePayment: (paymentId: string, accepted: boolean) => Promise<PaymentResolveResponse>
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
      loadingOlderLog: false,
  logTotalPages: 1,
  privateMessages: [],
  tableTalk: [],
  tableTalkSupported: null,
  tableTalkLoading: false,
  tableTalkError: '',
  tableTalkRevision: 0,
  kpQuestionBusy: false,
  kpQuestionAnswer: '',
  kpQuestionError: '',
  kpQuestionSupported: null,
  map: null,
  liveNarration: '',
  cursor: '',
  streamStatus: 'idle',
  asrEnabled: false,
  ttsEnabled: false,
  actionBusy: false,
  gmBusy: false,
  health: { events: [] },
} satisfies Partial<GameStore>

export const useGameStore = create<GameStore>((set, get) => {
  let stream: GameStream | null = null
  let connectionVersion = 0
  let refreshVersion = 0
  let tableTalkVersion = 0
  let tableTalkRequestVersion = 0
  let suspended = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let claimController: AbortController | null = null
  let claimTimer: ReturnType<typeof setTimeout> | null = null

  // 凭据只留在闭包，不写入可检查的 store 状态；异步响应还须匹配原服务器与分享身份。
  function captureIdentity() {
    const baseUrl = buildUrl('/')
    const token = currentToken()
    const session = currentSessionToken()
    const share = JSON.stringify(currentShare())
    return () => baseUrl === buildUrl('/') && token === currentToken()
      && (session === null || session === currentSessionToken()) && share === JSON.stringify(currentShare())
  }

  function clearTableTalk() {
    tableTalkVersion += 1
    tableTalkRequestVersion += 1
    set({
      tableTalk: [], tableTalkSupported: null, tableTalkLoading: false, tableTalkError: '',
      kpQuestionBusy: false, kpQuestionAnswer: '', kpQuestionError: '', kpQuestionSupported: null,
      tableTalkRevision: tableTalkVersion,
    })
  }

  // settings 先 set 再同步 API；先清空旧身份的数据，微任务中再用已同步的新身份入局。
  useSettingsStore.subscribe((next, previous) => {
    const nextIdentity = activeIdentityOf(next)
    const previousIdentity = activeIdentityOf(previous)
    if (next.baseUrl === previous.baseUrl && next.token === previous.token
      && next.serverSessionTokens[next.baseUrl] === previous.serverSessionTokens[previous.baseUrl]
      && JSON.stringify(nextIdentity) === JSON.stringify(previousIdentity)) return
    const gameKey = get().gameKey
    if (!gameKey) return
    connectionVersion += 1
    refreshVersion += 1
    clearRefreshTimer()
    stopStream()
    clearTableTalk()
    set({ ...initial, gameKey, tableTalkRevision: tableTalkVersion })
    const version = connectionVersion
    queueMicrotask(() => {
      if (!isCurrent(gameKey, version)) return
      const wasSuspended = suspended
      get().enter(gameKey)
      if (wasSuspended) get().pause()
    })
  })

  function isCurrent(gameKey: string, version: number): boolean {
    return connectionVersion === version && get().gameKey === gameKey
  }

  function stopStream() {
    claimController?.abort()
    claimController = null
    if (claimTimer !== null) clearTimeout(claimTimer)
    claimTimer = null
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
          // 桌边问答可能没有可重放 ID；新连接尚无 ID 时不能清掉已知游标。
          cursor = cursor || get().cursor
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
          if (payload.type === 'table_talk_changed') {
            void get().refreshTableTalk()
            return
          }
          scheduleRefresh(gameKey, version)
        },
        onStatusChange: (status: StreamStatus) => {
          if (!isCurrent(gameKey, version) || suspended) return
          const previousStatus = get().streamStatus
          set({ streamStatus: status })
          // 无可重放 ID 的问答不会随游标补发；首次连接也要覆盖初次拉取到订阅之间的空窗。
          if (status === 'live' && previousStatus !== 'live') {
            // 唤醒时 REST 可能先于网络恢复而失败或挂起，订阅成功后补齐整局数据。
            if (get().error || !get().detail || get().loading) void get().refresh()
            else void get().refreshTableTalk()
          }
        },
        onError: (message) => {
          if (isCurrent(gameKey, version) && !suspended && message) set({ error: message })
        },
      },
    )
    stream.start()
  }

  async function refreshSpeechConfig(gameKey: string, version: number) {
    try {
      const config = await fetchAppConfig()
      if (isCurrent(gameKey, version) && !suspended) {
        set({
          asrEnabled: asrAvailable(config),
          ttsEnabled: serverTtsAvailable(config),
        })
      }
    } catch {
      // 配置拉不到时保持语音功能隐藏即可
    }

  }

  async function connect(gameKey: string, isPlayer: boolean, version: number) {
    if (!isCurrent(gameKey, version) || suspended) return
    set({ streamStatus: 'connecting' })
    // 语音配置和页面数据都可能在唤醒时挂起，不能成为实时连接的前置条件。
    void refreshSpeechConfig(gameKey, version)

    // Owner 在新设备登录后，会话 uid 是全新的、不在存档玩家列表里，
    // 直接订阅 SSE 会 403「未加入本局」。先 claim-gm 把当前会话
    // 绑定为存档 GM 身份（对齐 Web loadPlayContext 的做法）。
    if (!isPlayer) {
      const controller = new AbortController()
      claimController = controller
      claimTimer = setTimeout(() => controller.abort(), 15000)
      try {
        const gmUid = await claimGm(gameKey, controller.signal)
        if (gmUid && isCurrent(gameKey, version) && !suspended) set({ userId: gmUid })
      } catch {
        // 404=存档没有可恢复的 GM 身份（纯玩家分享局）；其余失败不阻断入局
      }
    }

    if (!isCurrent(gameKey, version) || suspended) return
    startStream(gameKey, version)
    void get().refresh()
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
      clearTableTalk()
      set({ ...initial, gameKey, userId: isPlayer ? share!.user : '', isGm: !isPlayer, tableTalkRevision: tableTalkVersion })
      void connect(gameKey, isPlayer, connectionVersion)
    },

    leave() {
      connectionVersion += 1
      refreshVersion += 1
      suspended = false
      clearRefreshTimer()
      stopStream()
      clearTableTalk()
      set({ ...initial, tableTalkRevision: tableTalkVersion })
    },

    pause() {
      if (!get().gameKey || suspended) return
      connectionVersion += 1
      refreshVersion += 1
      suspended = true
      clearRefreshTimer()
      stopStream()
      set({ streamStatus: 'idle', loading: false })
    },

    resume() {
      const { gameKey, isGm } = get()
      if (!gameKey) return
      // 解锁可能只有 inactive/焦点变化，不能依赖先收到 background 才允许恢复。
      connectionVersion += 1
      refreshVersion += 1
      suspended = false
      clearRefreshTimer()
      stopStream()
      void connect(gameKey, !isGm, connectionVersion)
    },

    async refresh() {
      const { gameKey, log: previousLog, detail: previousDetail, isGm } = get()
      if (!gameKey) return
      const requestVersion = ++refreshVersion
      const sameIdentity = captureIdentity()
      set({ loading: true })
      try {
        const [detail, characters, log, privateLog, map, health] = await Promise.all([
          fetchGameDetail(gameKey),
          fetchCharacters(gameKey),
          fetchLog(gameKey),
          fetchPrivateLog(gameKey),
          fetchMap(gameKey),
          isGm ? fetchHealth(gameKey, true) : Promise.resolve({ events: [] }),
          get().refreshTableTalk(),
        ])
        if (get().gameKey !== gameKey || requestVersion !== refreshVersion || !sameIdentity()) return
        const newLog = log.log ?? []
        // 新回合写入 log 时清掉上一轮的流式气泡，避免"思考中"与正式输出重复。
        // 第一页满员后长度不再增长，须按最新条目的 round 判断。
        const clearNarration = hasNewRound(previousLog, newLog)
        const runChanged = !!previousDetail?.run_id && previousDetail.run_id !== detail.run_id
        const playerRemoved = !isGm && !!get().userId
          && !(characters.players ?? []).some((player) => player.user_id === get().userId)
        if (runChanged || playerRemoved) clearTableTalk()
        if (playerRemoved) set({ tableTalkError: errorMessage(new ApiError('Player required', 403, 'PLAYER_NOT_IN_GAME')) })
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
          health,
          error: '',
          loading: false,
          liveNarration: clearNarration ? '' : get().liveNarration,
        })
        // 远端重开也换 run_id；旧频道请求与新 run 不可混用，须重取当前记录。
        if (runChanged && !playerRemoved) await get().refreshTableTalk()
      } catch (error) {
        if (get().gameKey === gameKey && requestVersion === refreshVersion && sameIdentity()) {
          if (error instanceof ApiError && [401, 403, 404].includes(error.status)) clearTableTalk()
          set({ error: errorMessage(error), loading: false })
        }
      }
    },

    async refreshTableTalk() {
      const { gameKey, tableTalkSupported } = get()
      if (!gameKey || tableTalkSupported === false) return
      const version = tableTalkVersion
      const requestVersion = ++tableTalkRequestVersion
      const sameIdentity = captureIdentity()
      const isCurrentRequest = () => get().gameKey === gameKey && tableTalkVersion === version
        && tableTalkRequestVersion === requestVersion && sameIdentity()
      set({ tableTalkLoading: true })
      try {
        const result = await fetchTableTalk(gameKey)
        if (isCurrentRequest()) set({ tableTalk: result.exchanges, tableTalkSupported: true, tableTalkError: '' })
      } catch (error) {
        if (!isCurrentRequest()) return
        if (isTableTalkUnsupported(error)) {
          set({ tableTalk: [], tableTalkSupported: false, tableTalkError: '' })
        } else {
          // 独立频道失败不阻断行动页加载；权限、限流与服务端错误仍在面板内明确展示。
          if (error instanceof ApiError && [401, 403].includes(error.status)) {
            // 权限失效也废弃尚未完成的私密提问，避免它稍后重新写回答案。
            clearTableTalk()
            set({ kpQuestionError: errorMessage(error) })
          }
          set({ tableTalk: [], tableTalkError: errorMessage(error) })
        }
      } finally {
        if (isCurrentRequest()) set({ tableTalkLoading: false })
      }
    },

    async askKp(question, visibility = 'private') {
      const state = get()
      const { gameKey, userId } = state
      if (state.kpQuestionBusy || !question.trim()) return
      if (state.kpQuestionSupported === false) return
      if (!canAskKpQuestion(gameKey, userId, state.players, currentShare(), !!currentToken())) {
        set({ kpQuestionError: errorMessage(new ApiError('Player required', 403, 'PLAYER_NOT_IN_GAME')) })
        return
      }
      const version = tableTalkVersion
      const sameIdentity = captureIdentity()
      const isCurrentRequest = () => get().gameKey === gameKey && get().userId === userId
        && tableTalkVersion === version && sameIdentity()
      set({ kpQuestionBusy: true, kpQuestionAnswer: '', kpQuestionError: '' })
      try {
        const response = await askKpQuestion(gameKey, question, visibility)
        if (!isCurrentRequest()) return
        set({ kpQuestionAnswer: response.answer, kpQuestionSupported: true })
        // 公开问答只刷新独立频道，绝不调用行动接口或写入 round log。
        if (response.visibility === 'party') await get().refreshTableTalk()
      } catch (error) {
        if (isCurrentRequest()) {
          set({ kpQuestionError: errorMessage(error), kpQuestionSupported: isTableTalkUnsupported(error) ? false : get().kpQuestionSupported })
        }
      } finally {
        if (isCurrentRequest()) set({ kpQuestionBusy: false })
      }
    },

    clearKpQuestion() {
      if (!get().kpQuestionBusy) set({
        kpQuestionAnswer: '',
        kpQuestionError: get().kpQuestionSupported === false ? get().kpQuestionError : '',
      })
    },

    async loadOlderLog() {
      const { gameKey, logPage, logTotalPages } = get()
      if (!gameKey || logPage >= logTotalPages || get().loadingOlderLog) return
      const nextPage = logPage + 1
      set({ loadingOlderLog: true })
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
      } finally {
        if (get().gameKey === gameKey) set({ loadingOlderLog: false })
      }
    },

    async submit(text) {
      const { gameKey } = get()
      if (!gameKey || !text.trim()) return
      set({ actionBusy: true })
      try {
        await submitAction(gameKey, text.trim())
        // 提交成功就结束发送态；全量刷新包含地图等慢请求，不能继续挡住输入/语音浮层。
        if (get().gameKey === gameKey) void get().refresh()
      } catch (error) {
        const message = errorMessage(error)
        if (
          error instanceof ApiError
          && error.code?.toUpperCase() === 'ECONOMY_DECISION_PENDING'
          && get().gameKey === gameKey
        ) {
          // 409 响应说明本地 detail 可能落后；只刷新权威状态，绝不自动重放写请求。
          await get().refresh()
        }
        if (get().gameKey === gameKey) set({ error: message })
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
      try {
        await advanceGame(gameKey)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        const message = errorMessage(error)
        if (
          error instanceof ApiError
          && error.code?.toUpperCase() === 'ECONOMY_DECISION_PENDING'
          && get().gameKey === gameKey
        ) {
          await get().refresh()
        }
        if (get().gameKey === gameKey) set({ error: message })
        throw error
      }
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
      try {
        await gmCommand(gameKey, text.trim())
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        const message = errorMessage(error)
        if (
          error instanceof ApiError
          && error.code?.toUpperCase() === 'ECONOMY_DECISION_PENDING'
          && get().gameKey === gameKey
        ) {
          await get().refresh()
        }
        if (get().gameKey === gameKey) set({ error: message })
        throw error
      }
    },

    // ---------- GM 工具 ----------

    async storyRecap() {
      const { gameKey } = get()
      if (!gameKey) return
      set({ gmBusy: true })
      try {
        await generateStoryRecap(gameKey)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async toggleMode() {
      const { gameKey, detail } = get()
      if (!gameKey || !detail) return
      set({ gmBusy: true })
      try {
        await setSoloMode(gameKey, !detail.solo_mode)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async toggleAccess() {
      const { gameKey, detail } = get()
      if (!gameKey || !detail) return
      set({ gmBusy: true })
      try {
        await setPlayerAccess(gameKey, detail.player_access_open === false)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async setAway(uid, away) {
      const { gameKey } = get()
      if (!gameKey) return
      set({ gmBusy: true })
      try {
        await setPlayerAway(gameKey, uid, away)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async kick(uid) {
      const { gameKey } = get()
      if (!gameKey) return
      set({ gmBusy: true })
      try {
        await kickPlayer(gameKey, uid)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async privateMessage(uid, text) {
      const { gameKey } = get()
      if (!gameKey || !text.trim()) return
      try {
        await sendPrivateMessage(gameKey, uid, text.trim())
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      }
    },

    async switchWorld(worldId) {
      const { gameKey } = get()
      if (!gameKey) return
      set({ gmBusy: true })
      try {
        await switchGameWorld(gameKey, worldId)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async resetGame() {
      const { gameKey } = get()
      if (!gameKey) return
      clearTableTalk()
      set({ gmBusy: true })
      try {
        await resetGame(gameKey)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async restartGame() {
      const { gameKey } = get()
      if (!gameKey) return
      clearTableTalk()
      set({ gmBusy: true })
      try {
        await restartGame(gameKey)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async refreshHealth() {
      const { gameKey, isGm } = get()
      if (!gameKey || !isGm) return
      try {
        const health = await fetchHealth(gameKey, true)
        if (get().gameKey === gameKey) set({ health })
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
      }
    },

    async resolveHealth(id, action) {
      const { gameKey } = get()
      if (!gameKey) return
      try {
        await resolveHealthEvent(gameKey, id, action)
        if (get().gameKey === gameKey) await get().refreshHealth()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      }
    },

    async fetchCharacterCards() {
      const { gameKey } = get()
      if (!gameKey) return { cards: [] }
      return fetchCharacterCards(gameKey)
    },

    async applyCharacterCard(card) {
      const { gameKey, userId } = get()
      if (!gameKey || !userId) return
      set({ gmBusy: true })
      try {
        await selectCharacterCard(gameKey, userId, card)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async allocatePoints(additions) {
      const { gameKey, userId, detail, players, ruleAttrs, ruleMeta, actionBusy, gmBusy } = get()
      const sheet = players.find((player) => player.user_id === userId)?.character_sheet ?? null
      const attributes = buildLevelUpAttributes(
        sheet, ruleAttrs.length ? ruleAttrs : ruleMeta?.attributes ?? [], additions,
      )
      if (!gameKey || !userId || actionBusy || gmBusy || !attributes
        || detail?.ruleset_runtime?.capabilities?.character_lifecycle === 'rules_aware') {
        throw new UserFacingError('dfPlayLevelUpInvalid')
      }
      const version = connectionVersion
      set({ gmBusy: true })
      try {
        await allocateCharacterPoints(gameKey, userId, attributes)
        if (isCurrent(gameKey, version)) await get().refresh()
      } catch (error) {
        if (isCurrent(gameKey, version)) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (isCurrent(gameKey, version)) set({ gmBusy: false })
      }
    },

    async updatePortrait(portrait) {
      const { gameKey, userId, detail } = get()
      if (!gameKey || !userId) return
      // rules-aware 局的角色由规则集托管，PUT 整卡会被拒，portrait 须走 profile
      // 补丁端点（对齐 Web savePortrait 的 hasRulesAwareCharacters 分支）
      const rulesAware =
        detail?.ruleset_runtime?.capabilities?.character_lifecycle === 'rules_aware'
      set({ gmBusy: true })
      try {
        if (rulesAware) {
          await updateRulesetCharacterProfile(gameKey, userId, portrait)
        } else {
          await updateCharacterPortrait(gameKey, userId, portrait)
        }
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async fetchWorldCandidates() {
      const { gameKey } = get()
      if (!gameKey) return []
      return fetchWorldCandidates(gameKey)
    },

    async fetchGeneratedImages() {
      const { gameKey } = get()
      if (!gameKey) return []
      const result = await fetchGeneratedImages(gameKey)
      return result.images ?? []
    },

    async createPayment(payload) {
      const { gameKey } = get()
      if (!gameKey) return
      set({ gmBusy: true })
      try {
        await createPaymentProposal(gameKey, payload)
        if (get().gameKey === gameKey) await get().refresh()
      } catch (error) {
        if (get().gameKey === gameKey) set({ error: errorMessage(error) })
        throw error
      } finally {
        if (get().gameKey === gameKey) set({ gmBusy: false })
      }
    },

    async decidePayment(paymentId, accepted) {
      const { gameKey } = get()
      if (!gameKey) return {}
      try {
        const result = await resolvePayment(gameKey, paymentId, accepted)
        if (get().gameKey === gameKey) await get().refresh()
        return result
      } catch (error) {
        const message = errorMessage(error)
        if (get().gameKey === gameKey) {
          // 决议失败也可能已改变服务端状态（如余额不足会自动拒绝）；刷新后再展示原错误。
          await get().refresh()
          if (get().gameKey === gameKey) set({ error: message })
        }
        throw error
      }
    },
  }
})

/**
 * 待运气决议的统一来源：pending_luck_decisions + round_check_results 内 pending 项。
 * 服务端在结算阶段把两条都挂在 detail 上（后者是本轮全部检定），离开结算阶段后
 * round_check_results 被清空，仅靠前者会漏掉部分可决议检定；并集去重后 LuckCard
 * 与检定卡内嵌按钮对同一条决议看到同一份数据。
 *
 * 归并结果按 detail 引用做缓存：zustand v5 的快照用 Object.is 比较，selector 每次
 * 返回新数组会触发 React 无限重渲染，必须保证 detail 不变时返回同一引用。
 */
let pendingLuckCache: { detail: GameDetail | null; result: CheckResult[] } = {
  detail: null,
  result: [],
}
export function selectPendingLuck(state: GameStore): CheckResult[] {
  const detail = state.detail
  if (pendingLuckCache.detail === detail) return pendingLuckCache.result
  const result = detail
    ? mergePendingLuck(detail.pending_luck_decisions ?? [], detail.round_check_results ?? [])
    : []
  pendingLuckCache = { detail, result }
  return result
}

/**
 * 当前用户角色卡（玩家模式）
 */
export function selectMySheet(state: GameStore) {
  if (!state.userId) return null
  return state.players.find((player) => player.user_id === state.userId)?.character_sheet ?? null
}

/** 提问须有本局角色；GM 也不能凭管理权限冒用未认领的角色。 */
export function selectCanAskKp(state: GameStore): boolean {
  return canAskKpQuestion(state.gameKey, state.userId, state.players, currentShare(), !!currentToken())
}

/** “GM 思考中”：判定阶段 或 正在流式输出 */
export function selectGmThinking(state: GameStore) {
  return state.detail?.state === 'active_judgment' || state.liveNarration.length > 0
}

/**
 * 当前身份需要处理的 economy_proposals 权威投影。
 * GM 奖励、付款人和全队分摊分别按 approval_policy 路由。
 *
 * selector 结果按 detail/身份缓存，避免 zustand v5 因新数组引用反复重渲染。
 */
let economyProposalCache: {
  detail: GameDetail | null
  userId: string
  result: PendingPayment[]
} = { detail: null, userId: '', result: [] }

export function selectMyPendingPayments(state: GameStore): PendingPayment[] {
  if (economyProposalCache.detail === state.detail && economyProposalCache.userId === state.userId) {
    return economyProposalCache.result
  }
  const proposals = economyProposalList(state.detail)
  const result = state.userId
    ? proposals.filter((proposal) => isEconomyProposalActionable(
        proposal,
        state.userId,
        String(state.detail?.gm_uid || ''),
      ))
    : []
  economyProposalCache = { detail: state.detail, userId: state.userId, result }
  return result
}

export function selectMyPendingPayment(state: GameStore): PendingPayment | null {
  return selectMyPendingPayments(state)[0] ?? null
}
