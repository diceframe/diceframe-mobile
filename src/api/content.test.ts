import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient } from './client'
import {
  CONTENT_SYNC_UNSUPPORTED,
  CommitPartialError,
  ContentSyncError,
  MAX_STATUS_ITEMS,
  OWNER_REQUIRED,
  PlanStaleError,
  SERVER_IDENTITY_UNAVAILABLE,
  SERVER_MISMATCH,
  commitImport,
  contentErrorMessage,
  contentStatus,
  exportContent,
  fetchOwnerConfig,
  previewImport,
  serverInstanceIdFromConfig,
} from './content'
import { claimPairingCode } from './pairing'
import type { ContentPushItem } from './types'
import { credentialKey } from '@/lib/seat-credentials'

const SRV = 'srv-aaaa'
const SOURCE = { kind: 'device' as const, id: 'install-1' }
const ITEM: ContentPushItem = { client_ref: 'card-1', kind: 'character_template', format: 'chara_card_v3', document: { spec: 'chara_card_v3' } }

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function sent(index = 0): { url: URL; init: RequestInit; headers: Headers; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[index]
  return { url: new URL(url), init, headers: new Headers(init.headers), body: JSON.parse(String(init.body ?? '{}')) }
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
  // 玩家模式 + 房主凭据并存：内容同步请求只能带房主凭据，不能带任何分享上下文
  configureApiClient({
    baseUrl: 'http://h:18000',
    token: 'owner-secret',
    sessionToken: 'session',
    share: { game: 'g', user: 'u1', delegate: '' },
    credentials: { [credentialKey('http://h:18000', 'g')]: { seat: 'SEAT', room: 'ROOM' } },
    onUnauthorized: undefined,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  configureApiClient({ baseUrl: '', token: null, sessionToken: null, share: null, credentials: {} })
})

describe('/api/content/* 不带分享上下文', () => {
  it('预览：POST + 确认头 + 房主凭据，没有分享 query、席位凭证或房间令牌', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, plan_digest: 'sha256:p', items: [], server_instance_id: SRV }))
    await previewImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM] })
    const { url, init, headers, body } = sent()
    expect(url.pathname).toBe('/api/content/import/preview')
    expect(url.search).toBe('')
    expect(init.method).toBe('POST')
    expect(headers.get('X-TRPG-Confirm')).toBe('true')
    expect(headers.get('Authorization')).toBe('Bearer owner-secret')
    expect(headers.get('Cookie')).toBe('trpg_session=session')
    expect(headers.get('X-Seat-Token')).toBeNull()
    expect(headers.get('X-Room-Token')).toBeNull()
    expect(body).toEqual({ source: SOURCE, items: [ITEM] })
  })

  it('房主 config 同样不带分享上下文，但带房主凭据（匿名探测拿不到 server_instance_id）', async () => {
    fetchMock.mockResolvedValue(json({ server_instance_id: SRV }))
    await expect(fetchOwnerConfig()).resolves.toEqual({ server_instance_id: SRV })
    const { url, headers } = sent()
    expect(url.pathname).toBe('/api/config')
    expect(url.search).toBe('')
    expect(headers.get('Authorization')).toBe('Bearer owner-secret')
    expect(headers.get('X-Seat-Token')).toBeNull()
  })
})

describe('预览与提交', () => {
  it('响应来自另一台服务器（server_instance_id 不符）时中止，成功与错误响应都检查', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, plan_digest: 'p', items: [], server_instance_id: 'srv-other' }))
    expect(await rejectionOf(previewImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM] })))
      .toMatchObject({ code: SERVER_MISMATCH })
    fetchMock.mockResolvedValueOnce(json({ ok: false, error_code: 'DECISION_REQUIRED', server_instance_id: 'srv-other' }, 400))
    expect(await rejectionOf(commitImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM], planDigest: 'p', decisions: {} })))
      .toMatchObject({ code: SERVER_MISMATCH })
  })

  it('install id 或服务器 id 不规范时不发请求', async () => {
    expect(await rejectionOf(previewImport({ serverInstanceId: SRV, source: { kind: 'device', id: 'bad id' }, items: [] })))
      .toMatchObject({ code: 'INSTALL_ID_INVALID' })
    expect(await rejectionOf(previewImport({ serverInstanceId: '', source: SOURCE, items: [] })))
      .toMatchObject({ code: SERVER_IDENTITY_UNAVAILABLE })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('超过 50 项在本地就拦下（与服务端 413 同码），不发请求', async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ ...ITEM, client_ref: `card-${index}` }))
    expect(await rejectionOf(previewImport({ serverInstanceId: SRV, source: SOURCE, items }))).toMatchObject({ code: 'TOO_MANY_ITEMS' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('提交：发回文档 + plan_digest + 决策；成功返回逐项结果', async () => {
    const rows = [{ client_ref: 'card-1', kind: 'character_template', status: 'updated', canonical_id: 'card_x', state_token: 's' }]
    fetchMock.mockResolvedValue(json({ ok: true, items: rows, server_instance_id: SRV }))
    const result = await commitImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM], planDigest: 'sha256:p', decisions: { 'card-1': 'update' } })
    expect(result.items).toEqual(rows)
    expect(sent().body).toEqual({ source: SOURCE, items: [ITEM], plan_digest: 'sha256:p', decisions: { 'card-1': 'update' } })
    expect(sent().url.pathname).toBe('/api/content/import/commit')
  })

  it('409 PLAN_STALE：交出服务端内嵌的新预览', async () => {
    const fresh = { ok: true, plan_digest: 'sha256:new', items: [{ client_ref: 'card-1', kind: 'character_template', action: 'update', allowed: ['update', 'duplicate', 'skip'], existing: { canonical_id: 'c', state_token: 't', server_modified: true } }] }
    fetchMock.mockResolvedValue(json({ ok: false, error_code: 'PLAN_STALE', preview: fresh }, 409))
    const error = await rejectionOf(commitImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM], planDigest: 'old', decisions: {} }))
    expect(error).toBeInstanceOf(PlanStaleError)
    expect((error as PlanStaleError).preview).toEqual(fresh)
    expect(contentErrorMessage(error)).toBe('服务器上的内容在你确认期间变了，请按最新情况重新确认。')
  })

  it('部分失败（409 单项拒绝 / 500 IMPORT_FAILED）：逐项结果原样交出', async () => {
    const rows = [
      { client_ref: 'card-1.book', kind: 'lorebook', status: 'created', canonical_id: 'b' },
      { client_ref: 'card-1', kind: 'character_template', status: 'error', error_code: 'IMPORT_FAILED' },
      { client_ref: 'book-2', kind: 'lorebook', status: 'not_attempted' },
    ]
    fetchMock.mockResolvedValue(json({ ok: false, error_code: 'IMPORT_FAILED', items: rows }, 500))
    const error = await rejectionOf(commitImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM], planDigest: 'p', decisions: {} }))
    expect(error).toBeInstanceOf(CommitPartialError)
    expect((error as CommitPartialError).rows).toEqual(rows)
    expect((error as CommitPartialError).status).toBe(500)
  })

  it('没有内容同步路由的旧服务端（404 无错误码）→ CONTENT_SYNC_UNSUPPORTED', async () => {
    fetchMock.mockResolvedValue(new Response('404: Not Found', { status: 404 }))
    expect(await rejectionOf(previewImport({ serverInstanceId: SRV, source: SOURCE, items: [ITEM] })))
      .toMatchObject({ code: CONTENT_SYNC_UNSUPPORTED })
  })
})

describe('导出与状态', () => {
  it('导出：origin 指向别的服务器时中止', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, items: [{ kind: 'lorebook', format: 'lorebook_v3', document: {}, origin: { server_instance_id: 'srv-x', canonical_id: 'b', state_token: '1', provenance: null } }] }))
    expect(await rejectionOf(exportContent(SRV, [{ kind: 'lorebook', canonical_id: 'b' }]))).toMatchObject({ code: SERVER_MISMATCH })
  })

  it('状态：用 /api/content/status，超过 500 项自动分批', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { items } = JSON.parse(String(init.body)) as { items: { kind: string; canonical_id: string }[] }
      return json({ ok: true, server_instance_id: SRV, items: items.map((item) => ({ ...item, exists: true, state_token: 't', provenance: null })) })
    })
    const refs = Array.from({ length: MAX_STATUS_ITEMS + 3 }, (_, index) => ({ kind: 'lorebook' as const, canonical_id: `b${index}` }))
    const statuses = await contentStatus(SRV, refs)
    expect(statuses).toHaveLength(MAX_STATUS_ITEMS + 3)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent(0).url.pathname).toBe('/api/content/status')
    expect((sent(1).body.items as unknown[]).length).toBe(3)
  })

  it('服务端还没有 /status（#500 之前）：退化为逐项导出，不存在的项记为 exists:false', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname
      if (path === '/api/content/status') return new Response('404: Not Found', { status: 404 })
      const [ref] = (JSON.parse(String(init.body)) as { items: { kind: string; canonical_id: string }[] }).items
      if (ref.canonical_id === 'gone') return json({ ok: false, error_code: 'NOT_FOUND', error: 'not found' }, 404)
      return json({ ok: true, items: [{ kind: ref.kind, format: 'lorebook_v3', document: {}, origin: { server_instance_id: SRV, canonical_id: ref.canonical_id, state_token: '7', provenance: { link: 'tracked' } } }] })
    })
    const statuses = await contentStatus(SRV, [{ kind: 'lorebook', canonical_id: 'b1' }, { kind: 'lorebook', canonical_id: 'gone' }])
    expect(statuses).toEqual([
      { kind: 'lorebook', canonical_id: 'b1', exists: true, state_token: '7', provenance: { link: 'tracked' } },
      { kind: 'lorebook', canonical_id: 'gone', exists: false, state_token: '', provenance: null },
    ])
  })
})

describe('server_instance_id 取得', () => {
  it('合法 id 直接用；身份文件损坏 → SERVER_IDENTITY_UNAVAILABLE；缺 id 时按有无房主凭据区分', () => {
    expect(serverInstanceIdFromConfig({ server_instance_id: SRV }, true)).toBe(SRV)
    const codeOf = (fn: () => unknown) => {
      try { fn() } catch (error) { return (error as ContentSyncError).code }
      return 'no-error'
    }
    expect(codeOf(() => serverInstanceIdFromConfig({ server_identity_error: 'SERVER_IDENTITY_UNAVAILABLE' }, true))).toBe(SERVER_IDENTITY_UNAVAILABLE)
    expect(codeOf(() => serverInstanceIdFromConfig({}, true))).toBe(CONTENT_SYNC_UNSUPPORTED)
    expect(codeOf(() => serverInstanceIdFromConfig({}, false))).toBe(OWNER_REQUIRED)
    expect(codeOf(() => serverInstanceIdFromConfig({ server_instance_id: 'bad id' }, true))).toBe(CONTENT_SYNC_UNSUPPORTED)
  })

  it('错误码映射：内容同步码走专用文案，其余回退通用 errorMessage', () => {
    expect(contentErrorMessage(new ApiError('x', 403, 'SOURCE_NOT_THIS_DEVICE'))).toContain('install id')
    expect(contentErrorMessage(new ApiError('x', 503, 'SERVER_IDENTITY_UNAVAILABLE'))).toContain('实例标识')
    expect(contentErrorMessage(new ApiError('x', 429, undefined, 5))).toContain('5')
  })
})

describe('配对上报 install id', () => {
  it('带上 install id；同 install 重新配对时返回被接管的旧设备', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, device_token: 'T', device_id: 'd2', label: 'x', replaced_device_id: 'd1' }))
    await expect(claimPairingCode('ABCD1234', 'phone', 'install-1')).resolves.toEqual({ deviceToken: 'T', replacedDeviceId: 'd1' })
    expect(sent().body).toEqual({ code: 'ABCD1234', label: 'phone', install_id: 'install-1' })
    // 配对是匿名请求：不带房主凭据，也不带分享上下文
    expect(sent().headers.get('Authorization')).toBeNull()
    expect(sent().headers.get('X-Seat-Token')).toBeNull()
  })

  it('Web 端没有 install id：不上报', async () => {
    fetchMock.mockResolvedValue(json({ ok: true, device_token: 'T', device_id: 'd', label: 'x' }))
    await expect(claimPairingCode('ABCD1234', 'web', null)).resolves.toEqual({ deviceToken: 'T' })
    expect(sent().body).toEqual({ code: 'ABCD1234', label: 'web' })
  })

  it.each([
    [400, 'INSTALL_ID_INVALID'],
    [409, 'INSTALL_ID_IN_USE'],
  ])('%s %s：配对码未被消耗，不带 install id 再兑换一次', async (status, code) => {
    fetchMock
      .mockResolvedValueOnce(json({ ok: false, error_code: code }, status))
      .mockResolvedValueOnce(json({ ok: true, device_token: 'T2', device_id: 'd', label: 'x' }))
    await expect(claimPairingCode('ABCD1234', 'phone', 'install-1')).resolves.toEqual({ deviceToken: 'T2', installIdRejected: code })
    expect(sent(1).body).toEqual({ code: 'ABCD1234', label: 'phone' })
  })

  it('其他失败（配对码错误等）原样抛出，不重试', async () => {
    fetchMock.mockResolvedValue(json({ ok: false, error_code: 'PAIRING_CODE_INVALID' }, 401))
    expect(await rejectionOf(claimPairingCode('ABCD1234', 'phone', 'install-1'))).toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
