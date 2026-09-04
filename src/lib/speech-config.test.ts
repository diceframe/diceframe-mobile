import { describe, expect, it } from 'vitest'

import { asrAvailable } from './speech-config'

describe('asrAvailable', () => {
  it('供应商引用已配置时启用 ASR', () => {
    expect(asrAvailable({
      asr_provider: 'openai-compatible',
      asr_provider_ref: 'sensevoice',
      asr_base_url: '',
    })).toBe(true)
  })

  it('兼容旧版直填地址配置', () => {
    expect(asrAvailable({
      asr_provider: 'openai-compatible',
      asr_base_url: 'https://asr.example.com/v1',
    })).toBe(true)
  })

  it('关闭或未绑定服务时保持不可用', () => {
    expect(asrAvailable({ asr_provider: 'disabled', asr_provider_ref: 'sensevoice' })).toBe(false)
    expect(asrAvailable({ asr_provider: 'openai-compatible', asr_provider_ref: '  ', asr_base_url: '' })).toBe(false)
  })
})
