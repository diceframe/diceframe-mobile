/**
 * 语音接口封装。
 * - 转写（ASR）：原生录音(m4a/AAC)字节作为请求体直传，Content-Type 决定
 *   服务端文件扩展名（audio/mp4 → mp4 → Whisper）；lang 作为 query 透传成
 *   Whisper 的 language 字段，缺了会触发逐次语言自动检测（对齐 Web speechApi.transcribe）。
 * - 合成（TTS）：JSON 入、音频字节出（Web 用 blob + Audio 播放，移动端写缓存文件后播放）。
 */
import { api, apiBlob, ApiError, errorMessage } from './client'
import type { TKey } from '@/i18n/keyset'
import type { TranscriptionResponse, TtsSpeechRequest } from './types'

/**
 * ASR 失败的展示文案：转写接口返回的 error 原文本就是写给玩家的原因
 * （如“ASR 服务没有识别到任何内容”），与 Web 一致直接透传；
 * 其余错误（录音/准备的原生异常等）仍走通用状态码兜底。
 */
export function transcribeErrorText(error: unknown, fallback: TKey): string {
  if (error instanceof ApiError && error.message) return error.message
  return errorMessage(error, fallback)
}

export async function transcribeAudio(
  gameKey: string,
  audio: Uint8Array,
  mimeType: string,
  lang = '',
): Promise<string> {
  const result = await api<TranscriptionResponse>(
    `/games/${encodeURIComponent(gameKey)}/transcription`,
    {
      query: { lang: lang || undefined },
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: audio as unknown as BodyInit,
    },
  )
  if (typeof result.text !== 'string') {
    // 正常 200 一定带 text，缺 text 属契约异常：服务端附了原因就透传原文，
    // 空消息时由 transcribeErrorText 落回通用兜底，客户端不再另行加工。
    throw new ApiError(typeof result.error === 'string' ? result.error : '', 200)
  }
  return result.text
}

export interface SpeechAudio {
  bytes: ArrayBuffer
  contentType: string
  cacheHit: boolean
}

export async function synthesizeSpeech(
  gameKey: string,
  request: TtsSpeechRequest,
): Promise<SpeechAudio> {
  const response = await apiBlob(`/games/${encodeURIComponent(gameKey)}/speech`, {
    method: 'POST',
    body: JSON.stringify(request),
  })
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('Content-Type') ?? 'audio/mpeg',
    cacheHit: response.headers.get('X-DiceFrame-TTS-Cache') === 'hit',
  }
}
