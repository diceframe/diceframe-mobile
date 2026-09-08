import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient } from './client'
import { askKpQuestion, canAskKpQuestion, fetchTableTalk, isTableTalkUnsupported, parseTableTalkResponse } from './table-talk'

const exchange = {
  id: 'q1', actor_uid: 'u1', actor_name: '调查员', question: '门上是什么？',
  answer: '是已见过的纹章。', round: 3, created_at: '2026-09-08T00:00:00Z', visibility: 'party',
}
const answer = {
  ok: true, kind: 'kp_table_talk', answer: '是已见过的纹章。', visibility: 'private',
  advanced: false, action_consumed: false, round_number: 3,
}
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  configureApiClient({
    baseUrl: 'https://table.example', token: null, sessionToken: 'session',
    share: { game: 'game/a', user: 'u1', roomToken: 'room', delegate: '1' },
    onUnauthorized: undefined,
  })
})
afterEach(() => vi.unstubAllGlobals())

function respond(data: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(data), { status }))
}

describe('桌外问答 API 契约', () => {
  it('默认私密，沿用客户端的编码、分享身份、会话与 confirm 头', async () => {
    respond(answer)
    await askKpQuestion('game/a', '  门上是什么？  ')
    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/api/games/game%2Fa/kp-question')
    expect(parsed.searchParams.get('user')).toBe('u1')
    expect(parsed.searchParams.get('room_token')).toBe('room')
    expect(parsed.searchParams.get('delegate')).toBe('1')
    expect(init.method).toBe('POST')
    expect(init.headers.get('Cookie')).toBe('trpg_session=session')
    expect(init.headers.get('X-TRPG-Confirm')).toBe('true')
    expect(JSON.parse(init.body)).toEqual({ question: '门上是什么？', visibility: 'private' })
  })

  it('全队提问显式传 party，不调用行动端点', async () => {
    respond({ ...answer, visibility: 'party', exchange })
    await askKpQuestion('game/a', '问题', 'party')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).visibility).toBe('party')
  })

  it('空问题和超长问题不发送请求', async () => {
    await expect(askKpQuestion('g', '  ')).rejects.toMatchObject({ code: 'EMPTY_QUESTION' })
    await expect(askKpQuestion('g', '字'.repeat(1001))).rejects.toMatchObject({ code: 'QUESTION_TOO_LONG' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { advanced: true }, { action_consumed: true }, { visibility: 'party' }, { answer: '' }, { ok: false },
  ])('拒绝不符合桌外问答契约的响应 %j', async (patch) => {
    respond({ ...answer, ...patch })
    await expect(askKpQuestion('g', '问题')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('独立读取公开记录，过滤私密或破损投影', async () => {
    respond({ ok: true, exchanges: [exchange, { ...exchange, id: 'private', visibility: 'private' }, { id: 'broken' }] })
    await expect(fetchTableTalk('game/a')).resolves.toEqual({ ok: true, exchanges: [exchange] })
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/api/games/game%2Fa/table-talk')
  })

  it('缺失列表属于响应契约错误，不作为空列表吞掉', () => {
    expect(() => parseTableTalkResponse({ ok: true })).toThrow(ApiError)
  })

  it.each([401, 403, 409, 429, 500, 502, 503])('原样保留 HTTP %s 及业务错误码', async (status) => {
    respond({ code: 'TEST_ERROR', retry_after: 12 }, status)
    await expect(fetchTableTalk('g')).rejects.toMatchObject({ status, code: 'TEST_ERROR', retryAfter: 12 })
  })
})

describe('权限与旧端点降级', () => {
  it('已认领的玩家/GM 均可提问，管理身份不代替角色', () => {
    const players = [{ user_id: 'u1' }]
    expect(canAskKpQuestion('g', 'u1', players, null, true)).toBe(true)
    expect(canAskKpQuestion('g', 'owner', players, null, true)).toBe(false)
    expect(canAskKpQuestion('g', 'u1', players, { game: 'g', user: 'u1' }, false)).toBe(true)
    expect(canAskKpQuestion('g', 'u1', players, { game: 'other', user: 'u1' }, false)).toBe(false)
    expect(canAskKpQuestion('g', 'u1', players, { game: 'g', user: 'other' }, false)).toBe(false)
  })

  it('Owner 预览须显式代操作才可提问', () => {
    const players = [{ user_id: 'u1' }]
    expect(canAskKpQuestion('g', 'u1', players, { game: 'g', user: 'u1' }, true)).toBe(false)
    expect(canAskKpQuestion('g', 'u1', players, { game: 'g', user: 'u1', delegate: '1' }, true)).toBe(true)
  })

  it('仅缺端点状态可降级，游戏不存在和关键错误不可降级', () => {
    for (const status of [404, 405, 501]) expect(isTableTalkUnsupported(new ApiError('', status))).toBe(true)
    for (const status of [401, 403, 409, 429, 500, 502, 503]) expect(isTableTalkUnsupported(new ApiError('', status))).toBe(false)
    expect(isTableTalkUnsupported(new ApiError('', 404, 'GAME_NOT_FOUND'))).toBe(false)
    expect(isTableTalkUnsupported(new Error('network'))).toBe(false)
  })
})
