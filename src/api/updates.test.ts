import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchLatestRelease } from './updates'

function mockResponse(status: number, json: () => Promise<unknown>) {
  return { ok: status >= 200 && status < 300, status, json } as unknown as Response
}

describe('GitHub latest release 拉取', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('请求 latest 端点并携带 GitHub Accept 头', async () => {
    const payload = { tag_name: 'v0.2.0' }
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, async () => payload))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchLatestRelease()).resolves.toEqual(payload)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/diceframe/diceframe-mobile/releases/latest')
    expect(init.headers).toEqual({ Accept: 'application/vnd.github+json' })
  })

  it('请求超过十五秒时中止并给出本地化错误', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })))
    const request = fetchLatestRelease()
    const assertion = expect(request).rejects.toThrow('dfUpdatesCheckFailed')
    await vi.advanceTimersByTimeAsync(15_000)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([500, 502, 503])('%s 不直接显示 GitHub 状态码', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(status, async () => ({}))))
    await expect(fetchLatestRelease()).rejects.toThrow('dfUpdatesCheckFailed')
  })

  it('断网不透传底层异常', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchLatestRelease()).rejects.toThrow('dfUpdatesCheckFailed')
  })

  it('404 映射为暂无正式版本', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(404, async () => ({}))))
    await expect(fetchLatestRelease()).rejects.toThrow('dfUpdatesNoReleases')
  })

  it.each([403, 429])('%s 映射为限流提示', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(status, async () => ({}))))
    await expect(fetchLatestRelease()).rejects.toThrow('dfUpdatesRateLimited')
  })

  it('非 JSON 响应给出可读错误（防止代理返回 HTML 时泄漏英文 SyntaxError）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, async () => {
      throw new SyntaxError('Unexpected token < in JSON')
    })))
    await expect(fetchLatestRelease()).rejects.toThrow('dfUpdatesBadPayload')
  })
})
