import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, errorMessage, validateAccessToken } from '@/api/client'
import i18n from '@/i18n'
import { getT } from '@/i18n/t'
import { UserFacingError } from './user-facing-error'

afterEach(async () => {
  vi.unstubAllGlobals()
  await i18n.changeLanguage('zh-CN')
})

describe('面向用户的错误提示', () => {
  it.each([
    new TypeError('Cannot read properties of undefined (reading token)'),
    new SyntaxError('Unexpected token < in JSON at position 0'),
    new Error('java.lang.IllegalStateException: recorder is not prepared'),
    new Error('Traceback: /srv/app/secret.py password=private'),
    '<html>502 Bad Gateway</html>',
    { message: 'internal error', token: 'secret' }, null, undefined,
  ])('未知异常和非 Error 值不泄漏内部内容：%s', (error) => {
    expect(errorMessage(error)).toBe(getT()('dfErrorsUnexpected'))
    expect(errorMessage(error, 'dfPlayTtsFailed')).toBe(getT()('dfPlayTtsFailed'))
  })

  it.each(['Network request failed', 'Failed to fetch', 'fetch failed', 'Load failed', 'NetworkError when attempting to fetch resource.'])('识别网络异常：%s', (message) => {
    expect(errorMessage(new TypeError(message))).toBe(getT()('dfCommonNetworkError'))
  })

  it.each([
    [400, 'dfErrorsInvalidInput'], [401, 'dfErrorsUnauthorized'], [403, 'dfErrorsForbidden'],
    [404, 'dfErrorsNotFound'], [408, 'dfErrorsTimeout'], [409, 'dfErrorsConflict'],
    [413, 'dfErrorsFileTooLarge'], [422, 'dfErrorsInvalidInput'], [429, 'dfErrorsRateLimited'],
    [500, 'dfErrorsServerUnavailable'], [502, 'dfErrorsServerUnavailable'], [504, 'dfErrorsTimeout'],
  ] as const)('状态 %s 使用本地提示', (status, key) => {
    expect(errorMessage(new ApiError('SQL error: secret', status, 'UNKNOWN'))).toBe(getT()(key))
  })

  it('限流显示合法等待时间，异常数字使用通用提示', () => {
    expect(errorMessage(new ApiError('raw', 429, undefined, 12.4))).toBe('操作太频繁，请在 13 秒后重试。')
    for (const seconds of [NaN, Infinity, -1, 0]) {
      expect(errorMessage(new ApiError('raw', 429, undefined, seconds))).toBe(getT()('dfErrorsRateLimited'))
    }
  })

  it('超时与明确业务提示优先于操作兜底', () => {
    const timeout = new Error('native abort detail')
    timeout.name = 'AbortError'
    expect(errorMessage(timeout)).toBe(getT()('dfErrorsTimeout'))
    expect(errorMessage(new ApiError('internal detail', 409, 'ROUND_PROCESSING'))).toBe(getT()('apiErrors.round_processing'))
    expect(errorMessage(new UserFacingError('dfErrorsEmptyRecording'))).toBe(getT()('dfErrorsEmptyRecording'))
  })

  it.each(['zh-CN', 'en', 'ja'])('展示时使用当前语言：%s', async (language) => {
    const error = new UserFacingError('dfLoginPasswordRequired')
    await i18n.changeLanguage(language)
    expect(errorMessage(error)).toBe(getT()('dfLoginPasswordRequired'))
    expect(errorMessage(new ApiError('raw', 503))).toBe(getT()('dfErrorsServerUnavailable'))
    expect(errorMessage(new Error('raw'))).toBe(getT()('dfErrorsUnexpected'))
  })

  it('登录区分密码错误和服务器故障', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('<html>upstream traceback</html>', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(validateAccessToken('wrong').catch(errorMessage)).resolves.toBe(getT()('dfLoginWrongPassword'))
    await expect(validateAccessToken('valid').catch(errorMessage)).resolves.toBe(getT()('dfErrorsServerUnavailable'))
  })
})
