/**
 * M3 评审修复的回归测试（每条都在修复前失败）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureApiClient } from './client'
import {
  OWNER_REQUIRED,
  SERVER_MISMATCH,
  assertContentServer,
  contentErrorKey,
  contentStatus,
  exportContent,
  pairingInstallIdNoticeKey,
  previewImport,
  resolveContentServer,
  type ContentServer,
} from './content'
import { getT } from '@/i18n/t'
import i18n from '@/i18n'
import { patchCardDocument, readCardV3, writeCardV3, type CardBody } from '@/lib/portable/card-v3'

const SRV = 'srv-aaaa'
const SOURCE = { kind: 'device' as const, id: 'install-1' }
const ITEM = { client_ref: 'card-1', kind: 'character_template' as const, document: {} }
const fetchMock = vi.fn()

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

function server(overrides: Partial<ContentServer> = {}): ContentServer {
  return { serverInstanceId: SRV, baseUrl: 'http://h:18000', strict: false, hasStatus: false, ...overrides }
}

let onUnauthorized: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  onUnauthorized = vi.fn<() => void>()
  configureApiClient({ baseUrl: 'http://h:18000', token: 'owner', sessionToken: 's', share: null, credentials: {}, onUnauthorized })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  configureApiClient({ baseUrl: '', token: null, sessionToken: null, share: null, credentials: {}, onUnauthorized: undefined })
})

describe('1. 服务器身份：地址与实例一起锁定，#500+ 服务端缺 id 视为不符', () => {
  it('resolveContentServer：读房主 config 取 id，并用空的 /status 探测能力（#500+ → strict）', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url).pathname
      if (path === '/api/config') return json({ server_instance_id: SRV })
      return json({ ok: true, items: [], server_instance_id: SRV })
    })
    await expect(resolveContentServer()).resolves.toEqual(server({ strict: true, hasStatus: true }))
  })

  it('#494 服务端没有 /status：不 strict，状态走 export 退化', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const path = new URL(url).pathname
      if (path === '/api/config') return json({ server_instance_id: SRV })
      return new Response('404: Not Found', { status: 404 })
    })
    await expect(resolveContentServer()).resolves.toEqual(server({ strict: false, hasStatus: false }))
  })

  it('strict 时响应缺 server_instance_id 视为不符；导出 origin 缺 id 同理', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, plan_digest: 'p', items: [] }))
    expect(await rejectionOf(previewImport({ server: server({ strict: true }), source: SOURCE, items: [ITEM] })))
      .toMatchObject({ code: SERVER_MISMATCH })
    fetchMock.mockResolvedValueOnce(json({ ok: true, server_instance_id: SRV, items: [{ kind: 'lorebook', format: 'lorebook_v3', document: {}, origin: { canonical_id: 'b', state_token: '1', provenance: null } }] }))
    expect(await rejectionOf(exportContent(server({ strict: true }), [{ kind: 'lorebook', canonical_id: 'b' }])))
      .toMatchObject({ code: SERVER_MISMATCH })
  })

  it('取得身份之后连接换了服务器地址：请求前与记录前都拒绝', async () => {
    const locked = server()
    configureApiClient({ baseUrl: 'http://other:18000' })
    expect(await rejectionOf(previewImport({ server: locked, source: SOURCE, items: [ITEM] }))).toMatchObject({ code: SERVER_MISMATCH })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(() => assertContentServer(locked)).toThrow(expect.objectContaining({ code: SERVER_MISMATCH }))
  })
})

describe('2. 退化状态查询按批导出，NOT_FOUND 二分定位，429 按 retry_after 等待', () => {
  it('每批最多 50 项；缺失的 id 二分出来记 exists:false；429 等待后重试', async () => {
    vi.useFakeTimers()
    const missing = new Set(['b7', 'b60'])
    let rateLimited = false
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname
      if (path === '/api/content/status') return new Response('404: Not Found', { status: 404 })
      const refs = (JSON.parse(String(init.body)) as { items: { kind: string; canonical_id: string }[] }).items
      if (!rateLimited) {
        rateLimited = true
        return json({ ok: false, error: 'slow down', retry_after: 2 }, 429)
      }
      if (refs.some((ref) => missing.has(ref.canonical_id))) return json({ ok: false, error_code: 'NOT_FOUND' }, 404)
      return json({ ok: true, items: refs.map((ref) => ({ kind: ref.kind, format: 'lorebook_v3', document: {}, origin: { server_instance_id: SRV, canonical_id: ref.canonical_id, state_token: 't', provenance: null } })) })
    })
    const refs = Array.from({ length: 70 }, (_, index) => ({ kind: 'lorebook' as const, canonical_id: `b${index}` }))
    const pending = contentStatus(server(), refs)
    await vi.advanceTimersByTimeAsync(2000)
    const statuses = await pending
    expect(statuses).toHaveLength(70)
    expect(statuses.filter((status) => !status.exists).map((status) => status.canonical_id).sort()).toEqual(['b60', 'b7'])
    const exportCalls = fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/content/export')
    // 逐项导出要 70 次；按批 + 二分：2 批 + 每个缺失项约 2·log2(50) 次 + 1 次 429 重试
    expect(exportCalls.length).toBeLessThanOrEqual(2 + 2 * 2 * Math.ceil(Math.log2(50)) + 1)
    for (const [, init] of exportCalls) {
      expect((JSON.parse(String(init.body)) as { items: unknown[] }).items.length).toBeLessThanOrEqual(50)
    }
  })
})

describe('3. 预览原因码与警告码有四语文案', () => {
  it.each([
    'PLUGIN_CARD', 'PLUGIN_BOOK', 'TRACKED_BY_OTHER_SOURCE', 'DETACHED_FROM_OTHER_SOURCE', 'RULESET_CARD',
    'PORTRAIT_NOT_PORTABLE', 'IMPORT_SOURCE_INVALID', 'BOOK_NOT_IMPORTED',
  ])('%s', async (code) => {
    const key = contentErrorKey(code)
    expect(key).toBeTruthy()
    for (const lang of ['zh-CN', 'en', 'ja', 'de']) {
      await i18n.changeLanguage(lang)
      expect(getT()(key!)).not.toBe(key)
    }
    await i18n.changeLanguage('zh-CN')
  })
})

describe('4. /content/ 上的 401 是「需要房主」，不触发全局登录跳转', () => {
  it('401 → OWNER_REQUIRED，onUnauthorized 不被调用', async () => {
    fetchMock.mockResolvedValue(json({ ok: false, error: 'unauthorized' }, 401))
    expect(await rejectionOf(previewImport({ server: server(), source: SOURCE, items: [ITEM] }))).toMatchObject({ code: OWNER_REQUIRED })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('5. 配对时的 INSTALL_ID_IN_USE 用单独文案（服务端缺 #495，去 Web 吊销旧设备）', () => {
  it('与推送时的 403 文案不同', () => {
    expect(pairingInstallIdNoticeKey('INSTALL_ID_IN_USE')).toBe('dfContentPairingInstallIdInUse')
    expect(pairingInstallIdNoticeKey('INSTALL_ID_IN_USE')).not.toBe(contentErrorKey('INSTALL_ID_IN_USE'))
    expect(getT()(pairingInstallIdNoticeKey('INSTALL_ID_IN_USE')!)).toContain('吊销')
    expect(pairingInstallIdNoticeKey(undefined)).toBeNull()
  })
})

describe('7. 删除多个数组下标与给出的顺序无关', () => {
  it('升序给出 [0]、[1] 也删的是原来的第 0、1 项', () => {
    const doc = writeCardV3({ character_name: 'A', skills: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } as unknown as CardBody)
    const next = patchCardDocument(doc, {}, { remove: [['skills', '0'], ['skills', '1']] })
    expect(readCardV3(next).body.skills).toEqual([{ name: 'c' }])
  })
})
