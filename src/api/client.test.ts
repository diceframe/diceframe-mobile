import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  api,
  apiBlob,
  buildPlaySseUrl,
  buildStaticAssetUrl,
  buildUrl,
  checkOwnerAccess,
  configureApiClient,
  errorMessage,
  fetchAppConfig,
  generateSessionToken,
  hasSeatToken,
  normalizeBaseUrl,
  retryOnRateLimit,
  shareQuery,
} from './client'
import { credentialKey, type CredentialSlots } from '@/lib/seat-credentials'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  configureApiClient({
    baseUrl: '', token: null, share: null, sessionToken: null, credentials: {},
    onUnauthorized: undefined, onShareCredentialRejected: undefined,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normalizeBaseUrl', () => {
  it('补全 http 协议并去尾部斜杠', () => {
    expect(normalizeBaseUrl('192.168.1.5:18000')).toBe('http://192.168.1.5:18000')
    expect(normalizeBaseUrl('http://127.0.0.1:18000/')).toBe('http://127.0.0.1:18000')
    expect(normalizeBaseUrl('  https://a.b/  ')).toBe('https://a.b')
    expect(normalizeBaseUrl('HTTP://HOST:80/')).toBe('http://host')
    expect(normalizeBaseUrl('https://user:secret@HOST:443/')).toBe('https://host')
    expect(normalizeBaseUrl('')).toBe('')
  })
})

describe('shareQuery', () => {
  it('无玩家身份时为空', () => {
    expect(shareQuery()).toBeNull()
  })

  it('尚无席位凭证时拼出 game/user/name/share（无访问密码与旧服务端的回退），从不带 room_token', () => {
    configureApiClient({
      share: { game: 'abc', user: 'u1', name: '骑士' },
    })
    const q = shareQuery()!
    expect(q.get('game')).toBe('abc')
    expect(q.get('user')).toBe('u1')
    expect(q.get('name')).toBe('骑士')
    expect(q.get('share')).toBe('1')
    expect(q.has('room_token')).toBe(false)
  })

  it('持有本局席位凭证的玩家不在 URL 里暴露 uid（设备上登录了房主也一样）；Owner 代操作仍指名席位', () => {
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1' },
      credentials: { [credentialKey('http://h', 'abc')]: { seat: 'S' } },
    })
    expect(shareQuery()!.has('user')).toBe(false)
    // 玩家身份与房主身份独立：玩家模式不以房主身份发请求，也就不靠 ?user= 指名
    configureApiClient({ token: 'owner' })
    expect(shareQuery()!.has('user')).toBe(false)
    configureApiClient({ share: { game: 'abc', user: 'u1', delegate: '1' } })
    expect(shareQuery()!.get('user')).toBe('u1')
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

  it('合并 path 中的 query，同名字段只保留新值且不修改额外参数', () => {
    const extra = new URLSearchParams('page=0&keyword=%E5%85%AC%E7%88%B5+%26+%E4%BC%AF%E7%88%B5')
    expect(buildUrl('games/x/log?page=1&page=2&existing=hello%20world', extra)).toBe(
      '/api/games/x/log?page=0&existing=hello+world&keyword=%E5%85%AC%E7%88%B5+%26+%E4%BC%AF%E7%88%B5',
    )
    expect(extra.get('existing')).toBeNull()
    expect(buildUrl('/games/x?existing=hello%20world')).toBe('/api/games/x?existing=hello%20world')
  })

  it('构造静态资源 URL 时不额外拼 /api', () => {
    configureApiClient({ baseUrl: 'http://h:18000' })
    expect(buildStaticAssetUrl('/avatars/v3/dnd5e/realistic-1.jpg')).toBe(
      'http://h:18000/v2-assets/avatars/v3/dnd5e/realistic-1.jpg',
    )
  })

  it('SSE 地址含票据、游标与玩家参数', () => {
    configureApiClient({
      baseUrl: 'http://h:18000',
      share: { game: 'abc', user: 'u1' },
      credentials: { [credentialKey('http://h:18000', 'abc')]: { room: 'rt1' } },
    })
    const url = buildPlaySseUrl('abc', 'T1', 'r3.p0.aaa.bbb')
    expect(url).toContain('/api/games/abc/sse?')
    expect(url).toContain('ticket=T1')
    expect(url).toContain('cursor=r3.p0.aaa.bbb')
    expect(url).toContain('user=u1')
    // SSE 靠一次性票据鉴权；房间令牌永不进 URL
    expect(url).not.toContain('room_token')
    expect(url).not.toContain('rt1')
  })
})

describe.each([
  { name: 'api', request: api },
  { name: 'apiBlob', request: apiBlob },
])('$name query 契约', ({ request }) => {
  it('统一编码，保留 0/false/显式空字符串，仅省略 null/undefined', async () => {
    configureApiClient({ baseUrl: 'http://h' })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    const signal = new AbortController().signal
    const query = { keyword: '公爵 & 伯爵/+?#%', offset: 0, enabled: false, empty: '', absent: null, missing: undefined }

    await request('/games/x/memories?limit=20&offset=99', {
      method: 'POST',
      body: '{}',
      headers: { 'X-Test': 'kept' },
      signal,
      query,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://h/api/games/x/memories?limit=20&offset=0&keyword=%E5%85%AC%E7%88%B5+%26+%E4%BC%AF%E7%88%B5%2F%2B%3F%23%25&enabled=false&empty=')
    expect(init).not.toHaveProperty('query')
    expect(init).toMatchObject({ method: 'POST', body: '{}', signal })
    expect(new Headers(init.headers).get('X-Test')).toBe('kept')
    expect(new Headers(init.headers).get('X-TRPG-Confirm')).toBe('true')
    expect(query.keyword).toBe('公爵 & 伯爵/+?#%')
  })

  it('空参数不产生多余问号', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await request('/games', { query: { keyword: undefined, page: null } })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/games')
  })

  it('当前分享身份覆盖 path 和业务 query 的同名字段，且每个字段只出现一次', async () => {
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1', name: '骑士 & 法师', delegate: 'd1' },
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await request('/games/abc/log?game=old&user=old&user=duplicate&name=old&share=0&delegate=old&room_token=old&page=1', {
      query: { game: 'other', user: 'other', name: 'other', share: false, delegate: 'other', room_token: 'other', page: 0 },
    })

    const query = new URL(fetchMock.mock.calls[0][0]).searchParams
    for (const [key, value] of Object.entries({ game: 'abc', user: 'u1', name: '骑士 & 法师', share: '1', delegate: 'd1', page: '0' })) {
      expect(query.getAll(key)).toEqual([value])
    }
    // 废弃的 room_token query 无论来自 path 还是业务参数都不发出去
    expect(query.has('room_token')).toBe(false)
  })

  it('持凭证时 path/业务 query 里的旧 user 也被剥掉', async () => {
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1' },
      credentials: { [credentialKey('http://h', 'abc')]: { seat: 'S' } },
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await request('/games/abc/log?user=old', { query: { user: 'other' } })
    const query = new URL(fetchMock.mock.calls[0][0]).searchParams
    expect(query.has('user')).toBe(false)
    expect(query.get('share')).toBe('1')
  })

  it('匿名请求保留业务 query，但不注入分享身份、Bearer 或会话', async () => {
    configureApiClient({
      baseUrl: 'http://h', token: 'secret', sessionToken: 'session',
      share: { game: 'abc', user: 'u1', name: '骑士', delegate: 'd1' },
      credentials: { [credentialKey('http://h', 'abc')]: { seat: 'S', room: 'R' } },
    })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await request('/config?existing=1', { query: { language: 'zh CN', page: 0 } }, { anonymous: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://h/api/config?existing=1&language=zh+CN&page=0')
    expect(init).not.toHaveProperty('query')
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(new Headers(init.headers).get('Cookie')).toBeNull()
    expect(new Headers(init.headers).get('X-Seat-Token')).toBeNull()
    expect(new Headers(init.headers).get('X-Room-Token')).toBeNull()
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

  it('公开配置探测不携带任何服务器凭据、分享参数或会话', async () => {
    configureApiClient({
      baseUrl: 'http://candidate',
      token: 'old-secret',
      sessionToken: 'deadbeef'.repeat(4),
      share: { game: 'old-game', user: 'old-user' },
    })
    fetchMock.mockResolvedValue(jsonResponse({ asr_provider: 'disabled' }))

    await fetchAppConfig()

    expect(fetchMock.mock.calls[0][0]).toBe('http://candidate/api/config')
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Authorization')).toBeNull()
    expect(headers.get('Cookie')).toBeNull()
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

  it('兼容 code 字段，并按当前语言映射大小写错误码', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        error: 'server fallback',
        error_code: '',
        code: 'ECONOMY_DECISION_PENDING',
      }, 409),
    )
    const error = (await rejectionOf(api('/games/abc/action'))) as ApiError
    expect(error.code).toBe('ECONOMY_DECISION_PENDING')
    expect(errorMessage(error)).toBe('请先处理待确认的经济提案，再继续本局叙事')
  })

  it('未知错误码按状态提示，不显示服务端原文', () => {
    expect(errorMessage(new ApiError('server detail', 409, 'UNKNOWN_CONFLICT'))).toBe(
      '当前状态已发生变化，请刷新后重试。',
    )
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
    const response = await apiBlob('/games/abc/speech', { method: 'POST', body: '{}' })
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('checkOwnerAccess', () => {
  it('开放服务器允许无 token 进入 Owner 列表', async () => {
    configureApiClient({ baseUrl: 'http://h', token: null })
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await expect(checkOwnerAccess()).resolves.toBe('allowed')
  })

  it('受保护服务器要求登录，离线时返回不可用', async () => {
    configureApiClient({ baseUrl: 'http://h', token: null })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
    await expect(checkOwnerAccess()).resolves.toBe('login-required')

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(checkOwnerAccess()).resolves.toBe('unavailable')
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

describe('席位凭证 / 房间令牌请求头注入', () => {
  const slots = (entries: Record<string, { seat?: string; room?: string }>): CredentialSlots => entries

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
  })

  function sentHeaders(index = 0): Headers {
    return new Headers(fetchMock.mock.calls[index][1].headers)
  }

  it('玩家模式：只给当前后端上该局的凭证，走请求头而不是 URL', async () => {
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1' },
      credentials: slots({
        [credentialKey('http://h', 'abc')]: { seat: 'seat-abc', room: 'room-abc' },
        [credentialKey('http://h', 'xyz')]: { seat: 'seat-xyz' },
      }),
    })
    await api('/games/abc/log')
    expect(sentHeaders().get('X-Seat-Token')).toBe('seat-abc')
    expect(sentHeaders().get('X-Room-Token')).toBe('room-abc')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.has('user')).toBe(false)
    expect(url.search).not.toContain('seat-abc')
    expect(url.search).not.toContain('room-abc')

    // 编码过的 gameKey 也按解码后的键匹配；别的局拿到的是它自己的凭证
    await api(`/games/${encodeURIComponent('xyz')}/sse-ticket`, { method: 'POST' })
    expect(sentHeaders(1).get('X-Seat-Token')).toBe('seat-xyz')
    expect(sentHeaders(1).get('X-Room-Token')).toBeNull()

    // 不属于任何对局的路径不带凭证
    await api('/games')
    expect(sentHeaders(2).get('X-Seat-Token')).toBeNull()
    expect(sentHeaders(2).get('X-Room-Token')).toBeNull()
  })

  it('永不发给别的服务器：同 gameKey 在另一台后端上没有凭证', async () => {
    configureApiClient({
      baseUrl: 'http://evil.example',
      share: { game: 'abc', user: 'u1' },
      credentials: slots({ [credentialKey('http://h', 'abc')]: { seat: 'seat-abc', room: 'room-abc' } }),
    })
    await api('/games/abc/log')
    expect(sentHeaders().get('X-Seat-Token')).toBeNull()
    expect(sentHeaders().get('X-Room-Token')).toBeNull()
    expect(hasSeatToken('abc')).toBe(false)
    // 没有凭证时回退到 ?user=（无访问密码 / 旧服务端）
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('user')).toBe('u1')
  })

  it('Owner/GM 模式与 delegate 代操作从不隐式携带席位凭证；delegate 仍以房主身份发出', async () => {
    const credentials = slots({ [credentialKey('http://h', 'abc')]: { seat: 'seat-abc' } })
    configureApiClient({ baseUrl: 'http://h', token: 'owner', share: null, credentials })
    await api('/games/abc/log')
    expect(sentHeaders(0).get('X-Seat-Token')).toBeNull()
    expect(sentHeaders(0).get('Authorization')).toBe('Bearer owner')

    configureApiClient({ token: null, share: null })
    await api('/games/abc/log')
    expect(sentHeaders(1).get('X-Seat-Token')).toBeNull()

    configureApiClient({ token: 'owner', share: { game: 'abc', user: 'u1', delegate: '1' } })
    await api('/games/abc/log')
    expect(sentHeaders(2).get('X-Seat-Token')).toBeNull()
    expect(sentHeaders(2).get('Authorization')).toBe('Bearer owner')
  })

  it('设备上登录了房主、以玩家身份游玩：不带房主凭据，带席位凭证与房间令牌（GM / 玩家身份独立）', async () => {
    const credentials = slots({ [credentialKey('http://h', 'abc')]: { seat: 'seat-abc', room: 'room-abc' } })
    configureApiClient({ baseUrl: 'http://h', token: 'owner', share: { game: 'abc', user: 'u1' }, credentials })
    await api('/games/abc/log')
    expect(sentHeaders(0).get('Authorization')).toBeNull()
    expect(sentHeaders(0).get('X-Seat-Token')).toBe('seat-abc')
    expect(sentHeaders(0).get('X-Room-Token')).toBe('room-abc')
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('share')).toBe('1')
    expect(url.searchParams.has('user')).toBe(false)
  })

  it('调用方显式给的席位凭证优先（GM 接管链接找回席位）', async () => {
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: '' },
      credentials: slots({ [credentialKey('http://h', 'abc')]: { seat: 'stored' } }),
    })
    await api('/games/abc/players', { method: 'POST', body: '{}', headers: { 'X-Seat-Token': 'from-link' } })
    expect(sentHeaders().get('X-Seat-Token')).toBe('from-link')
    expect(sentHeaders().get('X-TRPG-Confirm')).toBe('true')
  })

  it('401 SEAT_TOKEN_INVALID：内存凭证立刻作废并通知路由层，不当成 Owner 掉线', async () => {
    const onShareCredentialRejected = vi.fn()
    const onUnauthorized = vi.fn()
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1' },
      credentials: slots({ [credentialKey('http://h', 'abc')]: { seat: 'old', room: 'room' } }),
      onShareCredentialRejected,
      onUnauthorized,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error_code: 'SEAT_TOKEN_INVALID', error: 'x' }, 401))
    const error = (await rejectionOf(api('/games/abc/log'))) as ApiError
    expect(error.code).toBe('SEAT_TOKEN_INVALID')
    expect(onShareCredentialRejected).toHaveBeenCalledWith({ kind: 'seat', baseUrl: 'http://h', game: 'abc' })
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(hasSeatToken('abc')).toBe(false)

    await api('/games/abc/log')
    expect(sentHeaders(1).get('X-Seat-Token')).toBeNull()
    // 房间令牌与席位凭证独立，不连坐
    expect(sentHeaders(1).get('X-Room-Token')).toBe('room')
  })

  it('403 needs_room_password：标记 needsRoomPassword、清房间令牌并通知重新输入', async () => {
    const onShareCredentialRejected = vi.fn()
    configureApiClient({
      baseUrl: 'http://h',
      share: { game: 'abc', user: 'u1' },
      credentials: slots({ [credentialKey('http://h', 'abc')]: { seat: 'seat', room: 'expired' } }),
      onShareCredentialRejected,
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ok: false, error: '需要房间密码', error_code: 'room_password_required', needs_room_password: true,
    }, 403))
    const error = (await rejectionOf(api('/games/abc/log'))) as ApiError
    expect(error.needsRoomPassword).toBe(true)
    expect(onShareCredentialRejected).toHaveBeenCalledWith({ kind: 'room', baseUrl: 'http://h', game: 'abc' })
    await api('/games/abc/log')
    expect(sentHeaders(1).get('X-Room-Token')).toBeNull()
    expect(sentHeaders(1).get('X-Seat-Token')).toBe('seat')
  })

  it('Owner 请求的同类错误不清玩家凭证', async () => {
    const onShareCredentialRejected = vi.fn()
    configureApiClient({ baseUrl: 'http://h', token: 'owner', onShareCredentialRejected })
    fetchMock.mockResolvedValueOnce(jsonResponse({ error_code: 'SEAT_TOKEN_INVALID' }, 401))
    await rejectionOf(api('/games/abc/log'))
    expect(onShareCredentialRejected).not.toHaveBeenCalled()
  })

  it('429 没有 retry_after 正文时读 Retry-After 头，文案带等待秒数', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }))
    const error = (await rejectionOf(api('/games/abc/verify-room-password', { method: 'POST', body: '{}' }))) as ApiError
    expect(error.retryAfter).toBe(7)
    expect(errorMessage(error)).toContain('7')
  })
})

describe('凭证相关错误文案与工具', () => {
  it('上游大写错误码（FIELD_REQUIRES_GM / SEAT_TOKEN_*）与 room_password_changed 均有本地化文案', () => {
    expect(errorMessage(new ApiError('x', 403, 'FIELD_REQUIRES_GM'))).toBe(
      '这些角色卡字段（HP、等级、金币、属性、物品等）只能由 GM 修改。',
    )
    expect(errorMessage(new ApiError('x', 401, 'SEAT_TOKEN_INVALID'))).toBe('席位凭证无效或已失效，请向 GM 重新获取链接')
    expect(errorMessage(new ApiError('x', 409, 'room_password_changed'))).toBe('房间密码已更改，请重新输入')
  })

  it('会话 token 为 32 位 hex，来自安全随机源（不再用 Math.random）', () => {
    const random = vi.spyOn(Math, 'random')
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()))
    expect(tokens.size).toBe(50)
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(random).not.toHaveBeenCalled()
  })

  it('retryOnRateLimit：短时 429 等待后重试一次，长等待或其他错误直接抛出', async () => {
    vi.useFakeTimers()
    try {
      const request = vi.fn()
        .mockRejectedValueOnce(new ApiError('slow', 429, undefined, 2))
        .mockResolvedValueOnce('ok')
      const pending = retryOnRateLimit(request)
      await vi.advanceTimersByTimeAsync(2000)
      await expect(pending).resolves.toBe('ok')
      expect(request).toHaveBeenCalledTimes(2)

      const tooLong = vi.fn().mockRejectedValue(new ApiError('slow', 429, undefined, 60))
      await expect(retryOnRateLimit(tooLong)).rejects.toBeInstanceOf(ApiError)
      expect(tooLong).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('normalizeBaseUrl 与凭证键的一致性（统一规范化）', () => {
  it('query / hash / 地址栏凭据不是服务器身份的一部分；路径前缀保留', () => {
    expect(normalizeBaseUrl('http://h:18000/trpg/?x=1#y')).toBe('http://h:18000/trpg')
    expect(normalizeBaseUrl('HTTPS://User:pw@NAS.local:443/Trpg/')).toBe('https://nas.local/Trpg')
  })

  it('非 http(s) 协议与无法解析的地址一律无效，不拼出奇怪的键', () => {
    expect(normalizeBaseUrl('ftp://h')).toBe('')
    expect(normalizeBaseUrl('javascript://alert(1)')).toBe('')
    expect(normalizeBaseUrl('http://')).toBe('')
  })

  it('scheme、host、路径前缀不同的地址永不相撞', () => {
    const keys = [
      'http://h:18000', 'https://h:18000', 'http://h2:18000', 'http://h:18001',
      'http://h:18000/a', 'http://h:18000/A', 'http://h:18000/a/b',
    ].map(normalizeBaseUrl)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('跨源重定向不得带走凭证', () => {
  function redirectedTo(url: string, body: unknown = { ok: true }): Response {
    const response = new Response(JSON.stringify(body), { status: 200 })
    Object.defineProperty(response, 'url', { value: url })
    Object.defineProperty(response, 'redirected', { value: true })
    return response
  }

  beforeEach(() => {
    configureApiClient({
      baseUrl: 'http://h:18000',
      share: { game: 'abc', user: 'u1' },
      credentials: { [credentialKey('http://h:18000', 'abc')]: { seat: 'S', room: 'R' } },
    })
  })

  it('请求一律 redirect: manual（浏览器与 expo/fetch 据此不跟随跳转）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api('/games/abc/log')
    await apiBlob('/games/abc/speech', { method: 'POST', body: '{}' })
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
    expect(fetchMock.mock.calls[1][1].redirect).toBe('manual')
  })

  it('最终落到别的源（含 http→https 换协议）时拒绝响应', async () => {
    fetchMock.mockResolvedValueOnce(redirectedTo('http://evil.example/api/games/abc/log'))
    const error = (await rejectionOf(api('/games/abc/log'))) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('CROSS_ORIGIN_REDIRECT')

    fetchMock.mockResolvedValueOnce(redirectedTo('https://h:18000/api/games/abc/log'))
    expect(((await rejectionOf(apiBlob('/games/abc/log'))) as ApiError).code).toBe('CROSS_ORIGIN_REDIRECT')
  })

  it('manual 模式下的跳转响应（opaqueredirect / 3xx）同样拒绝，不当成功处理', async () => {
    const opaque = new Response(null, { status: 200 })
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
    Object.defineProperty(opaque, 'status', { value: 0 })
    fetchMock.mockResolvedValueOnce(opaque)
    expect(((await rejectionOf(api('/games/abc/log'))) as ApiError).code).toBe('CROSS_ORIGIN_REDIRECT')

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://evil/' } }))
    expect(((await rejectionOf(api('/games/abc/log'))) as ApiError).code).toBe('CROSS_ORIGIN_REDIRECT')
  })

  it('同源的最终地址照常放行；拦截提示有本地化文案', async () => {
    fetchMock.mockResolvedValueOnce(redirectedTo('http://h:18000/api/games/abc/log', { ok: 'same' }))
    await expect(api('/games/abc/log')).resolves.toEqual({ ok: 'same' })
    expect(errorMessage(new ApiError('x', 0, 'CROSS_ORIGIN_REDIRECT'))).toContain('重定向')
  })
})
