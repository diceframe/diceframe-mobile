import type { AppConfig } from '@/api/types'

/** ASR 仅接受新版供应商引用，旧版直填地址不再启用语音输入。 */
export function asrAvailable(config: Pick<AppConfig, 'asr_provider' | 'asr_provider_ref'>): boolean {
  return config.asr_provider === 'openai-compatible' && Boolean(config.asr_provider_ref?.trim())
}
