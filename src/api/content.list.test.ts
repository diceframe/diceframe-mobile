/**
 * POST /api/content/list（diceframe/diceframe#508）的客户端：分页、CURSOR_INVALID 重来、
 * 实例校验，以及列举来源对 KIND_NOT_SUPPORTED / 旧服务端的处理。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient } from './client'
import { CURSOR_INVALID, LIST_PAGING_STUCK, MAX_LIST_PAGES, SERVER_MISMATCH, contentErrorKey, listContent, type ContentServer } from './content'
import type { ContentListItem } from './types'
import { contentListSource } from '@/features/content-sync/list-source'
import type { ServerItemSource } from '@/features/content-sync/pull-session'

const SRV = 'srv-aaaa'
const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function server(overrides: Partial<ContentServer> = {}): ContentServer {
  return { serverInstanceId: SRV, baseUrl: 'http://h:18000', strict: true, hasStatus: true, ...overrides }
}

function item(id: string, extra: Partial<ContentListItem> = {}): ContentListItem {
  return { kind: 'lorebook', canonical_id: id, name: id, state_token: `t-${id}`, provenance: null, locked_reason: null, entries: 1, ...extra }
}

function page(items: ContentListItem[], next: string | null, instance = SRV): Response {
  return json({ ok: true, items, next_cursor: next, server_instance_id: instance })
}

function requestBodies(): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  configureApiClient({ baseUrl: 'http://h:18000', token: 'owner', sessionToken: 's', share: null, credentials: {}, onUnauthorized: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  configureApiClient({ baseUrl: '', token: null, sessionToken: null, share: null, credentials: {}, onUnauthorized: undefined })
})

describe('listContent', () => {
  it('多页：中间一页为空但 next_cursor 非空时继续，直到 next_cursor 为 null', async () => {
    fetchMock
      .mockResolvedValueOnce(page([item('a'), item('b')], 'c1'))
      .mockResolvedValueOnce(page([], 'c2'))
      .mockResolvedValueOnce(page([item('c')], null))
    const items = await listContent(server(), 'lorebook')
    expect(items.map((entry) => entry.canonical_id)).toEqual(['a', 'b', 'c'])
    expect(requestBodies()).toEqual([
      { kind: 'lorebook', cursor: null, limit: 500 },
      { kind: 'lorebook', cursor: 'c1', limit: 500 },
      { kind: 'lorebook', cursor: 'c2', limit: 500 },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/content/list')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('X-TRPG-Confirm')).toBe('true')
  })

  it('CURSOR_INVALID：从头重来一次（不重复上一轮的项）；再失败就抛出', async () => {
    fetchMock
      .mockResolvedValueOnce(page([item('a')], 'c1'))
      .mockResolvedValueOnce(json({ ok: false, error_code: CURSOR_INVALID, server_instance_id: SRV }, 400))
      .mockResolvedValueOnce(page([item('a')], 'c9'))
      .mockResolvedValueOnce(page([item('b')], null))
    expect((await listContent(server(), 'lorebook')).map((entry) => entry.canonical_id)).toEqual(['a', 'b'])
    expect((requestBodies()[2] as { cursor: unknown }).cursor).toBeNull()

    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(page([item('a')], 'c1'))
      .mockResolvedValueOnce(json({ ok: false, error_code: CURSOR_INVALID, server_instance_id: SRV }, 400))
      .mockResolvedValueOnce(page([item('a')], 'c1'))
      .mockResolvedValueOnce(json({ ok: false, error_code: CURSOR_INVALID, server_instance_id: SRV }, 400))
    expect(await rejectionOf(listContent(server(), 'lorebook'))).toMatchObject({ code: CURSOR_INVALID })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('列举中途服务器身份变了：整个列举失败（不返回半份结果）', async () => {
    fetchMock
      .mockResolvedValueOnce(page([item('a')], 'c1'))
      .mockResolvedValueOnce(page([item('b')], null, 'srv-other'))
    expect(await rejectionOf(listContent(server(), 'lorebook'))).toMatchObject({ code: SERVER_MISMATCH })

    fetchMock.mockReset()
    fetchMock.mockImplementationOnce(async () => {
      // 第一页返回之前连接被切到另一台服务器
      configureApiClient({ baseUrl: 'http://other:18000' })
      return page([item('a')], 'c1')
    })
    expect(await rejectionOf(listContent(server(), 'lorebook'))).toMatchObject({ code: SERVER_MISMATCH })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('服务端重复给出用过的 cursor：抛 LIST_PAGING_STUCK，不无限翻页', async () => {
    fetchMock
      .mockResolvedValueOnce(page([item('a')], 'c1'))
      .mockResolvedValueOnce(page([], 'c2'))
      .mockResolvedValueOnce(page([], 'c1'))
    expect(await rejectionOf(listContent(server(), 'lorebook'))).toMatchObject({ code: LIST_PAGING_STUCK })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(contentErrorKey(LIST_PAGING_STUCK)).toBe('dfContentListPagingStuck')
  })

  it('页数超过上限：抛 LIST_PAGING_STUCK', async () => {
    let n = 0
    fetchMock.mockImplementation(async () => page([], `c${++n}`))
    expect(await rejectionOf(listContent(server(), 'lorebook'))).toMatchObject({ code: LIST_PAGING_STUCK })
    expect(fetchMock).toHaveBeenCalledTimes(MAX_LIST_PAGES)
  })

  it('KIND_NOT_SUPPORTED / CURSOR_INVALID 都有四语文案', () => {
    expect(contentErrorKey('KIND_NOT_SUPPORTED')).toBe('dfContentKindNotSupported')
    expect(contentErrorKey('CURSOR_INVALID')).toBe('dfContentCursorInvalid')
  })
})

describe('列举来源（contentListSource）', () => {
  const tracked: ServerItemSource = { list: async () => ({ items: [{ kind: 'lorebook', canonicalId: 'mine', stateToken: 't' }] }) }
  const real = (srv = server()) => contentListSource((kind) => listContent(srv, kind), tracked)

  it('列举项 → 拉取 ref：带 state_token 与 locked_reason', async () => {
    fetchMock.mockResolvedValueOnce(page([item('a', { locked_reason: 'PLUGIN_BOOK' }), item('b')], null))
    expect(await real().list('lorebook')).toEqual({ items: [
      { kind: 'lorebook', canonicalId: 'a', name: 'a', stateToken: 't-a', lockedReason: 'PLUGIN_BOOK' },
      { kind: 'lorebook', canonicalId: 'b', name: 'b', stateToken: 't-b' },
    ] })
  })

  it('书：400 KIND_NOT_SUPPORTED（服务器没启用 Lorebook）→ 空列表加提示，不当作错误', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: false, error_code: 'KIND_NOT_SUPPORTED', server_instance_id: SRV }, 400))
    expect(await real().list('lorebook')).toEqual({ items: [], notice: 'KIND_NOT_SUPPORTED' })
  })

  it('旧服务端（/content/list 裸 404 / 405）→ 退回本机已跟随的项并提示只能刷新', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    expect(await real(server({ strict: false })).list('lorebook')).toEqual({
      items: [{ kind: 'lorebook', canonicalId: 'mine', stateToken: 't' }], notice: 'TRACKED_ONLY',
    })
    fetchMock.mockResolvedValueOnce(new Response('', { status: 405 }))
    expect((await real(server({ strict: false })).list('lorebook')).notice).toBe('TRACKED_ONLY')
  })

  it('带错误码的 404 与其他错误不退回，原样抛出', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: false, error_code: 'NOT_FOUND', server_instance_id: SRV }, 404))
    expect(await rejectionOf(real().list('lorebook'))).toMatchObject({ code: 'NOT_FOUND' })
    fetchMock.mockResolvedValueOnce(json({ ok: false, error_code: 'SERVER_IDENTITY_UNAVAILABLE' }, 503))
    expect(await rejectionOf(real().list('lorebook'))).toMatchObject({ code: 'SERVER_IDENTITY_UNAVAILABLE' })
  })
})
