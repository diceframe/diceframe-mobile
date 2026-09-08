import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient } from './client'
import { setLuckTimeout, setNarrativePerspective } from './game-settings'
import type { NarrativePerspective } from '@/lib/game-settings'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  configureApiClient({
    baseUrl: 'http://game-settings.test',
    token: 'owner-token',
    sessionToken: 'session-test',
    share: null,
    onUnauthorized: undefined,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  configureApiClient({ baseUrl: '', token: null, sessionToken: null, share: null })
})

function respond(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status }))
}

describe('独立对局设置 API', () => {
  it('视角 POST 编码对局键、只发送 perspective，并复用客户端确认与会话头', async () => {
    respond({ ok: true, narrative_perspective: 'third_person' })
    await expect(setNarrativePerspective('web|room/a ?#中', 'third_person')).resolves.toBe('third_person')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`http://game-settings.test/api/games/${encodeURIComponent('web|room/a ?#中')}/settings/narrative-perspective`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ perspective: 'third_person' })
    const headers = new Headers(init?.headers)
    expect(headers.get('X-TRPG-Confirm')).toBe('true')
    expect(headers.get('Cookie')).toBe('trpg_session=session-test')
    expect(headers.get('Authorization')).toBe('Bearer owner-token')
  })

  it.each([0, 60, 3600])('幸运超时 %s 单独 POST，不访问或提交房间密码', async (seconds) => {
    respond({ ok: true, luck_timeout_seconds: seconds })
    await expect(setLuckTimeout('game/a', seconds)).resolves.toBe(seconds)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://game-settings.test/api/games/game%2Fa/settings/luck-timeout')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ seconds })
    expect(new Headers(init?.headers).get('X-TRPG-Confirm')).toBe('true')
  })

  it('保留分享身份与房间令牌查询参数', async () => {
    configureApiClient({ share: { game: 'room', user: 'gm', roomToken: 'room-token' } })
    respond({ ok: true })
    await setLuckTimeout('room', 0)
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('user')).toBe('gm')
    expect(url.searchParams.get('room_token')).toBe('room-token')
    expect(url.searchParams.get('share')).toBe('1')
  })

  it('只回显确认成功的设置值，不修改请求输入', async () => {
    respond({ ok: true, narrative_perspective: 'immersive' })
    respond({ ok: true, luck_timeout_seconds: 120 })
    await expect(setNarrativePerspective('room', 'auto')).resolves.toBe('immersive')
    await expect(setLuckTimeout('room', 60)).resolves.toBe(120)
  })

  it('无回显字段时仍保留成功提交的值', async () => {
    respond({ ok: true })
    respond({ ok: true })
    await expect(setNarrativePerspective('room', 'auto')).resolves.toBe('auto')
    await expect(setLuckTimeout('room', 0)).resolves.toBe(0)
  })

  it.each([{ ok: false, error: 'GM only' }, { error: '设置拒绝' }])('HTTP 200 的业务拒绝不能显示保存成功', async (payload) => {
    respond(payload)
    respond(payload)
    await expect(setNarrativePerspective('room', 'auto')).rejects.toMatchObject({ message: payload.error, status: 200 })
    await expect(setLuckTimeout('room', 60)).rejects.toBeInstanceOf(ApiError)
  })

  it('ok=false 无错误文案时仍拒绝', async () => {
    respond({ ok: false })
    await expect(setLuckTimeout('room', 60)).rejects.toBeInstanceOf(ApiError)
  })

  it.each([403, 404, 429])('透传 HTTP %s 错误与服务端原因', async (status) => {
    respond({ error: 'GM only', error_code: 'forbidden', retry_after: 5 }, status)
    await expect(setNarrativePerspective('room', 'immersive')).rejects.toMatchObject({
      status, code: 'forbidden', message: 'GM only', retryAfter: 5,
    })
  })

  it('关闭或切局使用的 signal 原样传入 client，取消错误不被当作成功', async () => {
    const controller = new AbortController()
    const abortError = new Error('aborted')
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(abortError), { once: true })
    }))
    const operation = setLuckTimeout('room', 60, controller.signal)
    controller.abort()
    await expect(operation).rejects.toBe(abortError)
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('网络错误保留原异常供当前表单显示', async () => {
    const failure = new Error('offline')
    fetchMock.mockRejectedValueOnce(failure)
    await expect(setLuckTimeout('room', 60)).rejects.toBe(failure)
  })

  it.each([-1, 3601, 0.5, NaN, Infinity, '60' as unknown as number])('不把非法秒数 %s 交给服务端截断', async (seconds) => {
    await expect(setLuckTimeout('room', seconds)).rejects.toThrow('validationFailed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('拒绝未知视角与空对局键，不发请求', async () => {
    await expect(setNarrativePerspective('room', 'unknown' as NarrativePerspective)).rejects.toThrow('validationFailed')
    await expect(setNarrativePerspective(' ', 'auto')).rejects.toThrow('validationFailed')
    await expect(setLuckTimeout('', 60)).rejects.toThrow('validationFailed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
