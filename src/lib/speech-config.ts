import type { AppConfig } from '@/api/types'

/** ASR 新版供应商引用与旧版直填地址均可驱动语音输入。 */
export function asrAvailable(config: Pick<AppConfig, 'asr_provider' | 'asr_provider_ref' | 'asr_base_url'>): boolean {
  return config.asr_provider === 'openai-compatible' && Boolean(
    String(config.asr_provider_ref || '').trim() || String(config.asr_base_url || '').trim(),
  )
}
