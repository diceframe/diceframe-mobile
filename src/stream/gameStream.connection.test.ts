import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestSseTicket } from '@/api/games'
import { createGameStream, type GameStream } from './gameStream'

const { sources, MockEventSource } = vi.hoisted(() => {
  type Listener = (event: { data?: string; lastEventId?: string }) => void
  class MockEventSource {
    listeners = new Map<string, Listener>()
    close = vi.fn()
    constructor(public url: string) { sources.push(this) }
    addEventListener(type: string, listener: Listener) { this.listeners.set(type, listener) }
    removeAllEventListeners() { this.listeners.clear() }
    emit(type: string, event = {}) { this.listeners.get(type)?.(event) }
  }
  const sources: MockEventSource[] = []
  return { sources, MockEventSource }
})
vi.mock('react-native-sse', () => ({ default: MockEventSource }))
vi.mock('@/api/games', () => ({ requestSseTicket: vi.fn() }))

const handlers = { onEvent: vi.fn(), onStatusChange: vi.fn(), onError: vi.fn() }
let stream: GameStream
let cursor: string
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
async function settle() { await Promise.resolve(); await Promise.resolve() }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  sources.length = 0
  cursor = 'r1.p1'
  vi.mocked(requestSseTicket).mockReset().mockResolvedValue('ticket')
  stream = createGameStream('g', () => cursor, handlers)
})
afterEach(() => { stream.stop(); vi.useRealTimers() })

describe('锁屏后的实时连接恢复', () => {
  it('票据请求挂起时超时取消，重新取票，丢弃迟到的旧票据', async () => {
    const pending = deferred<string>()
    vi.mocked(requestSseTicket).mockImplementationOnce(() => pending.promise)
    stream.start()
    const signal = vi.mocked(requestSseTicket).mock.calls[0][1]!
    await vi.advanceTimersByTimeAsync(15000)
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestSseTicket).toHaveBeenCalledTimes(2)
    expect(sources).toHaveLength(1)
    pending.resolve('stale-ticket')
    await settle()
    expect(sources).toHaveLength(1)
    expect(handlers.onError).not.toHaveBeenCalled()
  })

  it('SSE 没有 open/error 时也会超时重试，并带最新游标取新连接', async () => {
    stream.start()
    await settle()
    const oldOpen = sources[0].listeners.get('open')!
    await vi.advanceTimersByTimeAsync(15000)
    expect(sources[0].close).toHaveBeenCalledOnce()
    cursor = 'r2.p2'
    await vi.advanceTimersByTimeAsync(5000)
    expect(sources).toHaveLength(2)
    expect(sources[1].url).toContain('cursor=r2.p2')
    oldOpen({})
    expect(handlers.onStatusChange).not.toHaveBeenCalledWith('live')
    sources[1].emit('open')
    expect(handlers.onStatusChange).toHaveBeenLastCalledWith('live')
  })

  it('正常连接长期静默不会被建连超时断开', async () => {
    stream.start()
    await settle()
    sources[0].emit('open')
    await vi.advanceTimersByTimeAsync(120000)
    expect(sources[0].close).not.toHaveBeenCalled()
    expect(requestSseTicket).toHaveBeenCalledOnce()
    expect(handlers.onEvent).not.toHaveBeenCalled()
  })

  it('停止后立即重启，旧票据的成功与失败都不能覆盖新连接', async () => {
    for (const result of ['resolve', 'reject'] as const) {
      stream.stop()
      sources.length = 0
      const pending = deferred<string>()
      vi.mocked(requestSseTicket).mockImplementationOnce(() => pending.promise)
      stream.start()
      stream.stop()
      stream.start()
      await settle()
      sources[0].emit('open')
      if (result === 'resolve') pending.resolve('old')
      else pending.reject(new Error('network request failed'))
      await settle()
      expect(sources).toHaveLength(1)
      expect(handlers.onStatusChange).toHaveBeenLastCalledWith('live')
      expect(handlers.onError).not.toHaveBeenCalled()
    }
  })

  it('连续建连超时进入轮询降级，停止后不再取票或刷新', async () => {
    stream.start()
    await vi.advanceTimersByTimeAsync(55000)
    expect(handlers.onStatusChange).toHaveBeenLastCalledWith('degraded')
    await vi.advanceTimersByTimeAsync(30000)
    expect(handlers.onEvent).toHaveBeenCalledWith('refresh', {}, cursor)
    stream.stop()
    const requests = vi.mocked(requestSseTicket).mock.calls.length
    const refreshes = handlers.onEvent.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(requestSseTicket).toHaveBeenCalledTimes(requests)
    expect(handlers.onEvent).toHaveBeenCalledTimes(refreshes)
  })

  it('error 与 close 连续通知只安排一次重连', async () => {
    stream.start()
    await settle()
    const oldClose = sources[0].listeners.get('close')!
    sources[0].emit('error')
    oldClose({})
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestSseTicket).toHaveBeenCalledTimes(2)
  })
})
