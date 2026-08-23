import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  api,
  buildPlaySseUrl,
  buildUrl,
  configureApiClient,
  normalizeBaseUrl,
  shareQuery,
} from './client'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  configureApiClient({ baseUrl: '', token: null, share: null, sessionToken: null, onUnauthorized: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normalizeBaseUrl', () => {
  it('补全 http 协议并去尾部斜杠', () => {
    expect(normalizeBaseUrl('192.168.1.5:18000')).toBe('http://192.168.1.5:18000')
    expect(normalizeBaseUrl('http://127.0.0.1:18000/')).toBe('http://127.0.0.1:18000')
    expect(normalizeBaseUrl('  https://a.b/  ')).toBe('https://a.b')
    expect(normalizeBaseUrl('')).toBe('')
  })
})

describe('shareQuery', () => {
  it('无玩家身份时为空', () => {
    expect(shareQuery()).toBeNull()
  })

  it('玩家身份拼出 game/user/share/room_token', () => {
    configureApiClient({
      share: { game: 'abc', user: 'u1', name: '骑士', roomToken: 'rt1' },
    })
    const q = shareQuery()!
    expect(q.get('game')).toBe('abc')
    expect(q.get('user')).toBe('u1')
    expect(q.get('name')).toBe('骑士')
    expect(q.get('share')).toBe('1')
    expect(q.get('room_token')).toBe('rt1')
  })
})

describe('buildUrl / buildPlaySseUrl', () => {
  it('拼 baseUrl + /api + path + query', () => {
    configureApiClient({ baseUrl: 'http://h:18000' })
    expect(buildUrl('/games/x')).toBe('http://h:18000/api/games/x')
    expect(buildUrl('/games/x/log', new URLSearchParams('page=2'))).toBe(
      'http://h:18000/api/games/x/log?page=2',
    )
  })

  it('SSE 地址含票据、游标与玩家参数', () => {
    configureApiClient({
      baseUrl: 'http://h:18000',
      share: { game: 'abc', user: 'u1', roomToken: 'rt1' },
    })
    const url = buildPlaySseUrl('abc', 'T1', 'r3.p0.aaa.bbb')
    expect(url).toContain('/api/games/abc/sse?')
    expect(url).toContain('ticket=T1')
    expect(url).toContain('cursor=r3.p0.aaa.bbb')
    expect(url).toContain('user=u1')
    expect(url).toContain('room_token=rt1')
  })
})

describe('api()', () => {
  it('GET 默认 JSON 头 + Bearer；非 GET 追加 X-TRPG-Confirm', async () => {
    configureApiClient({ baseUrl: 'http://h', token: 'secret' })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await api('/games')
    const getRequest = fetchMock.mock.calls[0]
    expect(getRequest[0]).toBe('http://h/api/games')
    const headers = new Headers(getRequest[1].headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer secret')
    expect(headers.get('X-TRPG-Confirm')).toBeNull()

    await api('/games', { method: 'POST', body: '{}' })
    const postHeaders = new Headers(fetchMock.mock.calls[1][1].headers)
    expect(postHeaders.get('X-TRPG-Confirm')).toBe('true')
  })

  it('玩家模式下请求 URL 带分享参数', async () => {
    configureApiClient({ baseUrl: 'http://h', share: { game: 'abc', user: 'u1' } })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api('/games/abc/log')
    expect(fetchMock.mock.calls[0][0]).toContain('user=u1')
    expect(fetchMock.mock.calls[0][0]).toContain('share=1')
  })

  it('429 携带 retry_after 与 error_code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: '慢一点', error_code: 'rate_limited', retry_after: 12.4 }, 429),
    )
    const error = (await rejectionOf(api('/games'))) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(13)
    expect(error.code).toBe('rate_limited')
    expect(error.message).toBe('慢一点')
  })

  it('非 2xx 抛 ApiError（含 error_code）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not found', error_code: 'game_not_found' }, 404))
    const error = (await rejectionOf(api('/games/zzz'))) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.code).toBe('game_not_found')
  })

  it('Owner 模式 401 触发 onUnauthorized，玩家模式不触发', async () => {
    const onUnauthorized = vi.fn()
    configureApiClient({ baseUrl: 'http://h', onUnauthorized })
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401))

    await rejectionOf(api('/games'))
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    configureApiClient({ share: { game: 'abc', user: 'u1' }, onUnauthorized })
    await rejectionOf(api('/games/abc'))
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('自动生成并稳定携带 trpg_session cookie（RN 读不到 set-cookie 的替代方案）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api('/games')
    await api('/games')
    const cookie1 = new Headers(fetchMock.mock.calls[0][1].headers).get('Cookie')
    const cookie2 = new Headers(fetchMock.mock.calls[1][1].headers).get('Cookie')
    expect(cookie1).toMatch(/^trpg_session=[0-9a-f]{32}$/)
    expect(cookie2).toBe(cookie1)
  })

  it('外部注入的 sessionToken 优先于自动生成', async () => {
    configureApiClient({ baseUrl: 'http://h', sessionToken: 'deadbeef'.repeat(4) })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api('/games')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Cookie')).toBe(
      `trpg_session=${'deadbeef'.repeat(4)}`,
    )
  })

  it('二进制响应体走 arrayBuffer 而不是 json', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    )
    const { apiBlob } = await import('./client')
    const response = await apiBlob('/games/abc/speech', { method: 'POST', body: '{}' })
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 捕获 Promise 的拒绝值（不抛出），便于断言错误映射 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}
