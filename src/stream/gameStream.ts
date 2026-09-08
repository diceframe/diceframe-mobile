/**
 * 对局实时流（SSE）通道。
 *
 * 对齐 Web useGame.ts 的连接策略：
 * - POST /games/{key}/sse-ticket 取一次性票据（30s TTL），再 GET /sse?ticket&cursor
 * - 每条消息记录 lastEventId 作为可恢复游标（服务端格式 r{n}.p{n}.a{digest}.s{digest}）
 * - 断开后 5s 重连（带游标）；连续失败进入轮询降级（30s REST 刷新兜底），重连仍继续
 *
 * 事件语义（对齐 gameSse.ts / routes/sse.py）：
 * baseline=仅确认基线；narration_delta/narration_reset=流式叙事；其余=触发完整刷新。
 * 服务端无心跳，空闲时连接完全静默——react-native-sse 的 timeout 保持默认 0（不启用空闲断开）。
 */
import EventSource from 'react-native-sse'

import { buildPlaySseUrl, errorMessage } from '@/api/client'
import { requestSseTicket } from '@/api/games'

export type GameSseEffect = 'baseline' | 'narration-delta' | 'narration-reset' | 'refresh'

export interface GameSsePayload {
  type?: string
  text?: string
  [key: string]: unknown
}

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'degraded'

export interface GameStreamHandlers {
  /** effect 为 refresh 时由调用方做完整 REST 刷新 */
  onEvent: (effect: GameSseEffect, payload: GameSsePayload, cursor: string) => void
  onStatusChange: (status: StreamStatus) => void
  /** 票据/连接失败等无法恢复的错误（已自动降级，供 UI 提示） */
  onError: (message: string) => void
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
  let source: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let consecutiveFailures = 0
  let cursor = ''
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

    const es = new EventSource(buildPlaySseUrl(gameKey, ticket, getCursor()), {
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
