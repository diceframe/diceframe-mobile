import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, configureApiClient } from './client'
import { transcribeAudio, transcribeErrorText } from './speech'
import { getT } from '@/i18n/t'
import { UserFacingError } from '@/lib/user-facing-error'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
  configureApiClient({ baseUrl: 'http://192.168.1.5:18000', token: null, share: null, sessionToken: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function audioBytes(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4])
}

function jsonResponse(text: string) {
  return new Response(JSON.stringify({ ok: true, text }), { status: 200 })
}

describe('transcribeAudio', () => {
  it('lang 拼进 query 透传成 Whisper language，跳过服务端语言检测', async () => {
    fetchMock.mockResolvedValue(jsonResponse('推开门'))
    const text = await transcribeAudio('g1', audioBytes(), 'audio/mp4', 'zh-CN')
    expect(text).toBe('推开门')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://192.168.1.5:18000/api/games/g1/transcription?lang=zh-CN')
    expect(init.method).toBe('POST')
    expect(init.headers.get('Content-Type')).toBe('audio/mp4')
    expect(init.headers.get('X-TRPG-Confirm')).toBe('true')
  })

  it('lang 为空时不带 query，保持与 Web speechApi.transcribe 一致', async () => {
    fetchMock.mockResolvedValue(jsonResponse('hello'))
    await transcribeAudio('g1', audioBytes(), 'audio/mp4')
    expect(fetchMock.mock.calls[0][0]).toBe('http://192.168.1.5:18000/api/games/g1/transcription')
  })

  it('ok 响应缺 text 时透传服务端原因原文，供调用方直接展示', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, error: 'ASR 服务没有识别到任何内容' }), { status: 200 }))
    await expect(transcribeAudio('g1', audioBytes(), 'audio/mp4', 'en-US')).rejects.toMatchObject({
      message: 'ASR 服务没有识别到任何内容',
      status: 200,
    })
  })
})

describe('transcribeErrorText', () => {
  it('转写接口的服务端原文直接透传，不落进通用状态码兜底', () => {
    expect(transcribeErrorText(new ApiError('ASR 服务没有识别到任何内容', 400), 'dfErrorsRecordFailed'))
      .toBe('ASR 服务没有识别到任何内容')
  })

  it('非接口错误仍走通用兜底文案', () => {
    expect(transcribeErrorText(new UserFacingError('dfErrorsRecordFailed'), 'dfErrorsRecordFailed'))
      .toBe(getT()('dfErrorsRecordFailed'))
    expect(transcribeErrorText(new Error('whatever'), 'dfErrorsRecordFailed'))
      .toBe(getT()('dfErrorsRecordFailed'))
  })
})
