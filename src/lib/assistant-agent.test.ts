import { describe, expect, it, vi } from 'vitest'

import {
  AgentStreamError,
  approvalDraftId,
  createAgentStreamParser,
  draftItemsComplete,
  draftItemsOf,
  editedDraftOf,
  fenceDirtyApproval,
  messagesForStorage,
  normaliseApproval,
  receiptResponse,
  requestMessagesOf,
  resultAssetId,
  safeNavigation,
  withEvent,
  type AgentStreamHandlers,
} from './assistant-agent'

function handlers() {
  return {
    onDelta: vi.fn(),
    onSources: vi.fn(),
    onReset: vi.fn(),
    onAgentEvent: vi.fn(),
  } satisfies AgentStreamHandlers
}

describe('Agent SSE 解析', () => {
  it('跨分块拼帧：增量文本、Agent 事件、引用、reset 各走各的回调', () => {
    const h = handlers()
    const parser = createAgentStreamParser(h)
    expect(parser.push('data: {"delta":"你"}\n\ndata: {"del')).toBe(false)
    expect(parser.push('ta":"好"}\r\n\r\nevent: session\ndata: {"session_id":"s1"}\n\n')).toBe(false)
    parser.push('event: sources\ndata: {"sources":[{"source":"a.md","heading":"A"},{"x":1}]}\n\nevent: reset\ndata: {}\n\n')
    expect(h.onDelta.mock.calls.map((call) => call[0])).toEqual(['你', '好'])
    expect(h.onAgentEvent).toHaveBeenCalledWith('session', { session_id: 's1' })
    expect(h.onSources).toHaveBeenCalledWith([{ source: 'a.md', heading: 'A' }])
    expect(h.onReset).toHaveBeenCalledTimes(1)
  })

  it('done 之后不再分发；结尾无空行的残帧在 finish 时处理', () => {
    const h = handlers()
    const parser = createAgentStreamParser(h)
    expect(parser.push('event: done\ndata: {}\n\ndata: {"delta":"x"}\n\n')).toBe(true)
    expect(h.onDelta).not.toHaveBeenCalled()
    const tail = createAgentStreamParser(h)
    tail.push('data: {"delta":"尾"}')
    tail.finish()
    expect(h.onDelta).toHaveBeenCalledWith('尾')
  })

  it('error 帧抛带错误码的异常；坏 JSON 当空载荷', () => {
    const parser = createAgentStreamParser(handlers())
    expect(() => parser.push('event: error\ndata: {"error":"boom","code":"RATE"}\n\n')).toThrow(AgentStreamError)
    const h = handlers()
    createAgentStreamParser(h).push('event: status\ndata: not-json\n\n')
    expect(h.onAgentEvent).toHaveBeenCalledWith('status', {})
  })
})

describe('请求与历史', () => {
  it('请求消息去空、截断单条、最多 20 条', () => {
    const history = Array.from({ length: 30 }, (_, index) => ({ role: 'user' as const, content: `m${index}` }))
    const result = requestMessagesOf([...history, { role: 'assistant', content: '  ' }], 'x'.repeat(9000))
    expect(result).toHaveLength(20)
    expect(result.at(-1)?.content).toHaveLength(8000)
    expect(result[0].content).toBe('m11')
  })

  it('事件记录去掉疑似凭据字段，tool_result 补齐 ok / partial', () => {
    const message = withEvent({ role: 'assistant', content: '' }, 'tool_result', { tool: 't', result: { ok: false, api_key: 'k', nested: { token: 'x', v: 1 } } })
    expect(message.events?.[0].payload).toEqual({ tool: 't', ok: false, partial: false, result: { ok: false, nested: { v: 1 } } })
  })

  it('持久化只留最近 20 条', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ role: 'user' as const, content: String(index) }))
    expect(messagesForStorage(many).map((item) => item.content)[0]).toBe('5')
  })
})

describe('导航白名单', () => {
  it('合法页面与查询键通过；外链、未知页面、未知键拒绝', () => {
    expect(safeNavigation({ route: '/play', query: { game: 'g1', section: undefined } })).toEqual({ route: 'play', query: { game: 'g1' } })
    expect(safeNavigation({ route: 'play', query: { game: 'g1', foo: 'x' } })).toBeNull()
    expect(safeNavigation({ route: 'play', url: 'https://x' })).toBeNull()
    expect(safeNavigation({ route: 'admin' })).toBeNull()
    expect(safeNavigation({ route: 'play', query: { token: 'x' } })).toBeNull()
    expect(safeNavigation({ route: 'worlds', query: { world: 'javascript:alert(1)' } })).toEqual({ route: 'worlds' })
  })
})

describe('待批准操作', () => {
  const base = { approval_id: 'a', plan_digest: 'd', tool: 'save_content' }

  it('缺关键字段拒收；过期时间兼容秒、毫秒与 ISO', () => {
    expect(normaliseApproval({ approval_id: 'a' })).toBeNull()
    const now = Date.parse('2026-10-17T12:00:00Z')
    expect(normaliseApproval({ ...base, expires_at: now / 1000 - 1 }, now)?.expired).toBe(true)
    expect(normaliseApproval({ ...base, expires_at: now + 60_000 }, now)?.expired).toBeUndefined()
    expect(normaliseApproval({ ...base, expires_at: '2026-10-17T11:00:00Z' }, now)?.expired).toBe(true)
    expect(normaliseApproval({ ...base, recovery_required: true }, now)?.expired).toBe(true)
  })

  it('关联草稿被本地改过时，批准标为需要重新生成', () => {
    const approval = normaliseApproval({ ...base, arguments: { payload: { draft_id: 'd1' } } })!
    expect(approvalDraftId(approval)).toBe('d1')
    expect(fenceDirtyApproval(approval, new Set(['d1']))).toMatchObject({ expired: true, recovery_required: true })
    expect(fenceDirtyApproval(approval, new Set())).toBe(approval)
  })

  it('回执优先用 response，旧数据回落 result', () => {
    expect(receiptResponse({ approval_id: 'a', plan_digest: 'd', response: { ok: false, error: 'e' } })).toEqual({ ok: false, error: 'e' })
    expect(receiptResponse({ approval_id: 'a', plan_digest: 'd', result: { ok: true, n: 1 } })).toEqual({ ok: true, n: 1 })
    expect(receiptResponse({ approval_id: 'a', plan_digest: 'd', result: 'x' })).toEqual({ ok: true, result: 'x' })
  })

  it('结果里的生成图 id', () => {
    expect(resultAssetId({ reference: { kind: 'generated', asset_id: 'img1' } })).toBe('img1')
    expect(resultAssetId({ asset_id: 'img2' })).toBe('img2')
    expect(resultAssetId('x')).toBe('')
  })
})

describe('内容草稿', () => {
  const review = { draft: { kind: 'lorebook', name: 'old', items: [{ id: 'i1', name: 'A', text: 't', target: 'lorebook', references: [1] }, null] } }

  it('取出可编辑条目，送审时以 items 为准并去掉顶层单条字段', () => {
    const items = draftItemsOf(review)
    expect(items).toEqual([{ id: 'i1', name: 'A', text: 't', target: 'lorebook', references: [1] }])
    items[0].name = 'B'
    expect(editedDraftOf(review, items)).toEqual({ kind: 'lorebook', items: [{ id: 'i1', name: 'B', text: 't', target: 'lorebook', references: [1] }] })
    expect(draftItemsComplete(items)).toBe(true)
    expect(draftItemsComplete([{ name: 'x', text: '', target: 'world' }])).toBe(false)
  })
})

describe('Agent 页面 → 移动端路由', () => {
  it('对局带上 game；没有对应页面的返回 null', async () => {
    const { mobileRouteOf } = await import('./assistant-routes')
    expect(mobileRouteOf({ route: 'play', query: { game: 'web|g|bot' } })).toBe('/play/web%7Cg%7Cbot')
    expect(mobileRouteOf({ route: 'play' })).toBe('/overview')
    expect(mobileRouteOf({ route: 'worlds' })).toBe('/worlds')
    expect(mobileRouteOf({ route: 'creator' })).toBeNull()
  })
})
