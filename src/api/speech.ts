/**
 * 语音接口封装。
 * - 转写（ASR）：原生录音(m4a/AAC)字节作为请求体直传，Content-Type 决定
 *   服务端文件扩展名（audio/mp4 → m4a → Whisper），对齐 Web speechApi.transcribe。
 * - 合成（TTS）：JSON 入、音频字节出（Web 用 blob + Audio 播放，移动端写缓存文件后播放）。
 */
import { api, apiBlob } from './client'
import type { TranscriptionResponse, TtsSpeechRequest } from './types'

export async function transcribeAudio(
  gameKey: string,
  audio: Uint8Array,
  mimeType: string,
  lang = 'zh-CN',
): Promise<string> {
  const result = await api<TranscriptionResponse>(
    `/games/${encodeURIComponent(gameKey)}/transcription`,
    {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: audio as unknown as BodyInit,
    },
  )
  if (typeof result.text !== 'string') {
    throw new Error(result.error || '转写失败：服务器未返回文本')
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
