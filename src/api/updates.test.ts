import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchLatestRelease } from './updates'

function mockResponse(status: number, json: () => Promise<unknown>) {
  return { ok: status >= 200 && status < 300, status, json } as unknown as Response
}

describe('GitHub latest release 拉取', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('404 映射为「还没有 GitHub Release」', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(404, async () => ({}))))
    await expect(fetchLatestRelease()).rejects.toThrow('还没有 GitHub Release')
  })

  it('403 映射为限流提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(403, async () => ({}))))
    await expect(fetchLatestRelease()).rejects.toThrow('GitHub API 暂时限流，请稍后再试')
  })

  it('非 JSON 响应给出可读错误（防止代理返回 HTML 时泄漏英文 SyntaxError）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(200, async () => {
      throw new SyntaxError('Unexpected token < in JSON')
    })))
    await expect(fetchLatestRelease()).rejects.toThrow('GitHub 返回的数据无法解析')
  })
})
