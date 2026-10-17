/**
 * 对局实时流（SSE）通道。
 *
 * 对齐 Web useGame.ts 的连接策略：
 * - POST /games/{key}/sse-ticket 取一次性票据（30s TTL），再 GET /sse?ticket
 * - 每条消息记录 lastEventId 作为游标（服务端格式 r{n}.p{n}.a{digest}.s{digest}），交给调用方
 * - 断开后 5s 重连；连续失败进入轮询降级（30s REST 刷新兜底），重连仍继续
 *
 * 与 Web 的差异：连接**不带游标**。服务端只在不带游标的新连接上立刻发 baseline，带游标时要等到
 * 下一次真有变化才写第一字节；react-native-sse 要收到响应体才触发 open，于是带游标的重连在安静的
 * 对局里一直停在「连接中」，还会被建连超时反复断开重连（实机）。改为每次都按新连接订阅，open 后
 * 若此前已有游标（重连、回前台）就要求一次完整刷新，补上断开期间没被推送的变化。
 *
 * 事件语义（对齐 gameSse.ts / routes/sse.py）：
 * baseline=仅确认基线；narration_delta/narration_reset=流式叙事；其余=触发完整刷新。
 * 服务端无心跳，空闲时连接完全静默——react-native-sse 的 timeout 保持默认 0（不启用空闲断开）。
 *
 * 撤销（diceframe/diceframe#512）：席位凭证被 GM 重新签发、房间密码改了或玩家入口关闭时，
 * 服务端用命名事件 `event: revoked`（data 为 `{error_code, error, needs_room_password?}`）结束这条流。
 * 收到后不再重连、不再轮询，交给 onRevoked 走既有的席位失效 / 房间密码流程。
 * 不发这个事件的服务端：一切照旧（断开后按原策略重连）。
 */
import EventSource from 'react-native-sse'

import { buildPlaySseUrl, errorMessage } from '@/api/client'
import { requestSseTicket } from '@/api/games'

export type GameSseEffect = 'baseline' | 'narration-delta' | 'narration-reset' | 'story-update' | 'refresh'

export interface GameSsePayload {
  type?: string
  text?: string
  [key: string]: unknown
}

/** stopped：服务端撤销了这条流（见 onRevoked），不会自己重连，要等调用方重新建流 */
export type StreamStatus = 'idle' | 'connecting' | 'live' | 'degraded' | 'stopped'

/** 服务端撤销这条流的原因（`event: revoked` 的 data） */
export interface SseRevocation {
  /** SEAT_TOKEN_INVALID / ROOM_TOKEN_INVALID / PLAYER_ACCESS_CLOSED；解析不出时为空串 */
  errorCode: string
  error: string
  needsRoomPassword: boolean
}

export function parseRevocation(data: string | null | undefined): SseRevocation {
  let payload: Record<string, unknown> = {}
  try {
    const parsed: unknown = data ? JSON.parse(data) : {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>
  } catch {
    payload = {}
  }
  return {
    errorCode: typeof payload.error_code === 'string' ? payload.error_code : '',
    error: typeof payload.error === 'string' ? payload.error : '',
    needsRoomPassword: payload.needs_room_password === true,
  }
}

export interface GameStreamHandlers {
  /** effect 为 refresh 时由调用方做完整 REST 刷新 */
  onEvent: (effect: GameSseEffect, payload: GameSsePayload, cursor: string) => void
  onStatusChange: (status: StreamStatus) => void
  /** 票据/连接失败等无法恢复的错误（已自动降级，供 UI 提示） */
  onError: (message: string) => void
  /** 服务端撤销了这条流：流已停止，不会再重连 */
  onRevoked?: (revocation: SseRevocation) => void
}

/** 只限制票据与首次建连，live 后不按静默时长断开（服务端无心跳）。 */
const CONNECT_TIMEOUT_MS = 15000
const RECONNECT_DELAY_MS = 5000
const POLL_FALLBACK_MS = 30000
/** 连续失败达到该次数即视为降级（仍持续重连） */
const DEGRADED_AFTER_FAILURES = 3

export function gameSseEffect(payload: GameSsePayload | null): GameSseEffect {
  const type = payload?.type || ''
  if (type === 'baseline') return 'baseline'
  if (type === 'narration_delta') return 'narration-delta'
  if (type === 'narration_reset') return 'narration-reset'
  // 角色对话模式：生成中下发整份剧情快照（替换而非追加），见 lib/story
  if (type === 'story_update') return 'story-update'
  return 'refresh'
}

export interface GameStream {
  start: () => void
  stop: () => void
}

export function createGameStream(
  gameKey: string,
  getCursor: () => string,
  handlers: GameStreamHandlers,
): GameStream {
  let stopped = true
  let source: EventSource<'revoked'> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let consecutiveFailures = 0
  let cursor = ''
  /** 这次 open 之前可能漏了事件（重连、或带着已知游标开始）：open 后要一次完整刷新 */
  let needsGapRefresh = false
  let attempt = 0
  let ticketController: AbortController | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null

  function clearConnectTimeout() {
    if (connectTimer !== null) clearTimeout(connectTimer)
    connectTimer = null
  }

  function closeConnection() {
    // stop/start 或超时后的旧票据、旧事件不能再接管新连接。
    attempt += 1
    clearConnectTimeout()
    ticketController?.abort()
    ticketController = null
    source?.removeAllEventListeners()
    source?.close()
    source = null
  }

  function setStatus(status: StreamStatus) {
    handlers.onStatusChange(status)
  }

  function clearTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function ensurePollFallback() {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      handlers.onEvent('refresh', {}, getCursor())
    }, POLL_FALLBACK_MS)
  }

  function stopPollFallback() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function scheduleReconnect() {
    clearTimers()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!stopped) connect()
    }, RECONNECT_DELAY_MS)
  }

  function handleCloseOrError() {
    closeConnection()
    if (stopped) return
    consecutiveFailures += 1
    if (consecutiveFailures >= DEGRADED_AFTER_FAILURES) {
      setStatus('degraded')
      ensurePollFallback()
    } else {
      setStatus('connecting')
    }
    scheduleReconnect()
  }

  async function connect() {
    if (stopped) return
    const version = ++attempt
    const isCurrent = () => !stopped && version === attempt
    setStatus('connecting')
    ticketController = new AbortController()
    connectTimer = setTimeout(() => {
      if (isCurrent()) handleCloseOrError()
    }, CONNECT_TIMEOUT_MS)
    let ticket: string
    try {
      ticket = await requestSseTicket(gameKey, ticketController.signal)
    } catch (error) {
      if (!isCurrent()) return
      closeConnection()
      handlers.onError(errorMessage(error))
      setStatus('degraded')
      ensurePollFallback()
      scheduleReconnect()
      return
    }
    if (!isCurrent()) return
    ticketController = null

    const es = new EventSource<'revoked'>(buildPlaySseUrl(gameKey, ticket), {
      method: 'GET',
      pollingInterval: RECONNECT_DELAY_MS,
    })
    source = es

    es.addEventListener('open', () => {
      if (!isCurrent()) return
      clearConnectTimeout()
      consecutiveFailures = 0
      stopPollFallback()
      setStatus('live')
      if (needsGapRefresh) handlers.onEvent('refresh', {}, cursor || getCursor())
      // 之后的每次 open 都是重连
      needsGapRefresh = true
    })

    es.addEventListener('message', (event) => {
      if (!isCurrent()) return
      const message = event as { data?: string | null; lastEventId?: string | null }
      if (message.lastEventId) cursor = message.lastEventId
      let payload: GameSsePayload | null = null
      try {
        payload = message.data ? (JSON.parse(message.data) as GameSsePayload) : null
      } catch {
        payload = null
      }
      handlers.onEvent(gameSseEffect(payload), payload ?? {}, cursor)
    })

    es.addEventListener('revoked', (event) => {
      if (!isCurrent()) return
      // 先整体停下（之后的 error/close 都不再触发重连），再交给调用方处理
      stopped = true
      clearTimers()
      stopPollFallback()
      closeConnection()
      setStatus('idle')
      handlers.onRevoked?.(parseRevocation((event as { data?: string | null }).data))
    })

    es.addEventListener('error', () => {
      // timeout/exception 等异常也统一从 error 事件进来
      if (isCurrent()) handleCloseOrError()
    })
    es.addEventListener('close', () => {
      if (isCurrent()) handleCloseOrError()
    })
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      consecutiveFailures = 0
      cursor = getCursor()
      needsGapRefresh = !!cursor
      void connect()
    },
    stop() {
      stopped = true
      clearTimers()
      stopPollFallback()
      closeConnection()
      setStatus('idle')
    },
  }
}
