import { describe, expect, it } from 'vitest'

import { asrAvailable } from './speech-config'

describe('asrAvailable', () => {
  it('供应商引用已配置时启用 ASR', () => {
    expect(asrAvailable({
      asr_provider: 'openai-compatible',
      asr_provider_ref: 'sensevoice',
    })).toBe(true)
  })

  it.each([undefined, '', '  '])('供应商引用为 %s 时，旧版地址不能启用 ASR', (reference) => {
    const config = {
      asr_provider: 'openai-compatible' as const,
      asr_provider_ref: reference,
      asr_base_url: 'https://asr.example.com/v1',
    }
    expect(asrAvailable(config)).toBe(false)
  })

  it('关闭或未绑定服务时保持不可用', () => {
    expect(asrAvailable({ asr_provider: 'disabled', asr_provider_ref: 'sensevoice' })).toBe(false)
    expect(asrAvailable({ asr_provider: 'openai-compatible', asr_provider_ref: '  ' })).toBe(false)
    expect(asrAvailable({ asr_provider_ref: 'sensevoice' })).toBe(false)
  })
})
