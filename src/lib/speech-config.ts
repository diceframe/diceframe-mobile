import type { AppConfig } from '@/api/types'
import { localeFromTag, type Locale } from '@/lib/locale'

type SpeechConfig = Pick<AppConfig, 'ai_providers' | 'asr_provider' | 'asr_provider_ref' | 'tts_provider' | 'tts_provider_ref'>

/** 引用必须指向实际服务商；本地免鉴权服务不要求密钥。 */
function hasProvider(config: SpeechConfig, reference: string | undefined): boolean {
  return Boolean(reference?.trim() && config.ai_providers?.some(
    (provider) => provider.id === reference && provider.base_url.trim(),
  ))
}

/** ASR 仅接受新版供应商引用，旧版直填地址不再启用语音输入。 */
export function asrAvailable(config: SpeechConfig): boolean {
  return config.asr_provider === 'openai-compatible' && hasProvider(config, config.asr_provider_ref)
}

const ASR_LANGUAGE_BY_LOCALE: Record<Locale, string> = {
  'zh-CN': 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
}

/** ASR 语言跟随界面语言；未知语言回落设备系统语言，系统语言也不在支持范围时归一到中文。 */
export function asrLanguageFor(locale: string, systemTag = ''): string {
  if (locale.startsWith('en')) return ASR_LANGUAGE_BY_LOCALE.en
  if (locale.startsWith('ja')) return ASR_LANGUAGE_BY_LOCALE.ja
  if (locale.startsWith('zh')) return ASR_LANGUAGE_BY_LOCALE['zh-CN']
  return ASR_LANGUAGE_BY_LOCALE[localeFromTag(systemTag)]
}

/** Edge 使用固定服务端点；其余服务器朗读引擎必须绑定服务商。 */
export function serverTtsAvailable(config: SpeechConfig): boolean {
  if (config.tts_provider === 'edge-tts') return true
  return (config.tts_provider === 'openai-compatible' || config.tts_provider === 'gpt-sovits')
    && hasProvider(config, config.tts_provider_ref)
}
