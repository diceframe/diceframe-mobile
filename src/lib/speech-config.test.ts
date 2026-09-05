import { describe, expect, it } from 'vitest'

import type { AiProvider } from '@/api/types'
import { asrAvailable, asrLanguageFor, serverTtsAvailable } from './speech-config'

const providers: AiProvider[] = [{ id: 'local', name: '本地语音', base_url: 'http://localhost:8000', api_format: 'openai' }]

describe('asrAvailable', () => {
  it('绑定有地址的服务商即可启用，不要求本地服务填写密钥', () => {
    expect(asrAvailable({
      asr_provider: 'openai-compatible', asr_provider_ref: 'local', ai_providers: providers,
    })).toBe(true)
  })

  it.each([undefined, '', '  ', 'missing'])('引用为 %s 时不能用旧地址启用 ASR', (reference) => {
    const config = {
      asr_provider: 'openai-compatible' as const,
      asr_provider_ref: reference,
      ai_providers: providers,
      asr_base_url: 'https://asr.example.com/v1',
    }
    expect(asrAvailable(config)).toBe(false)
  })

  it('引用没有目录或服务商没有地址时保持不可用', () => {
    expect(asrAvailable({ asr_provider: 'openai-compatible', asr_provider_ref: 'local' })).toBe(false)
    expect(asrAvailable({
      asr_provider: 'openai-compatible', asr_provider_ref: 'local',
      ai_providers: [{ ...providers[0], base_url: '  ' }],
    })).toBe(false)
  })

  it('关闭或缺失引擎时不能由有效引用启用', () => {
    expect(asrAvailable({ asr_provider: 'disabled', asr_provider_ref: 'local', ai_providers: providers })).toBe(false)
    expect(asrAvailable({ asr_provider_ref: 'local', ai_providers: providers })).toBe(false)
  })
})

describe('asrLanguageFor', () => {
  it('界面语言映射为带地区的 ASR 语言', () => {
    expect(asrLanguageFor('zh-CN')).toBe('zh-CN')
    expect(asrLanguageFor('zh')).toBe('zh-CN')
    expect(asrLanguageFor('en')).toBe('en-US')
    expect(asrLanguageFor('en-US')).toBe('en-US')
    expect(asrLanguageFor('ja')).toBe('ja-JP')
  })

  it('未知语言回落系统语言，系统语言也不支持时归一到中文', () => {
    expect(asrLanguageFor('fr', 'ja-JP')).toBe('ja-JP')
    expect(asrLanguageFor('ko', 'en-GB')).toBe('en-US')
    expect(asrLanguageFor('', 'zh-TW')).toBe('zh-CN')
    expect(asrLanguageFor('fr')).toBe('zh-CN')
    expect(asrLanguageFor('fr', 'fr-FR')).toBe('zh-CN')
  })
})

describe('serverTtsAvailable', () => {
  it.each(['openai-compatible', 'gpt-sovits'] as const)('%s 仅接受有效引用，允许本地空密钥', (engine) => {
    expect(serverTtsAvailable({
      tts_provider: engine, tts_provider_ref: 'local', ai_providers: providers,
    })).toBe(true)
    for (const reference of [undefined, '', '  ', 'missing']) {
      const config = {
        tts_provider: engine, tts_provider_ref: reference, ai_providers: providers,
        tts_base_url: 'https://tts.example.com/v1',
      }
      expect(serverTtsAvailable(config)).toBe(false)
    }
    expect(serverTtsAvailable({ tts_provider: engine, tts_provider_ref: 'local' })).toBe(false)
    expect(serverTtsAvailable({
      tts_provider: engine, tts_provider_ref: 'local', ai_providers: [{ ...providers[0], base_url: '' }],
    })).toBe(false)
  })

  it('Edge 在空服务商目录下可用', () => {
    expect(serverTtsAvailable({ tts_provider: 'edge-tts', ai_providers: [] })).toBe(true)
  })

  it('浏览器朗读及未配置引擎不启用服务器朗读', () => {
    expect(serverTtsAvailable({ tts_provider: 'browser', tts_provider_ref: 'local', ai_providers: providers })).toBe(false)
    expect(serverTtsAvailable({})).toBe(false)
  })
})
