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

import { ApiError, currentShare, errorMessage, fetchAppConfig } from '@/api/client'
import {
  advanceGame,
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
      const { gameKey, log: previousLog, isGm } = get()
      if (!gameKey) return
      const requestVersion = ++refreshVersion
      set({ loading: true })
      try {
        const [detail, characters, log, privateLog, map, health] = await Promise.all([
          fetchGameDetail(gameKey),
          fetchCharacters(gameKey),
          fetchLog(gameKey),
          fetchPrivateLog(gameKey),
          fetchMap(gameKey),
          isGm ? fetchHealth(gameKey, true) : Promise.resolve({ events: [] }),
        ])
        if (get().gameKey !== gameKey || requestVersion !== refreshVersion) return
        const newLog = log.log ?? []
        // 新回合写入 log 时清掉上一轮的流式气泡，避免"思考中"与正式输出重复。
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
          health,
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
        if (get().gameKey === gameKey) await get().refresh()
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

/** “GM 思考中”：判定阶段 或 正在流式输出 */
export function selectGmThinking(state: GameStore) {
  return state.detail?.state === 'active_judgment' || state.liveNarration.length > 0
}

/**
 * 当前身份需要处理的权威经济提案。新服务端优先投影 economy_proposals，旧服回退
 * pending_payments；GM 奖励、付款人和全队分摊分别按 approval_policy 路由。
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
