/**
 * 朗读引擎的可用性判定与系统引擎长文本分块（纯逻辑，带单测）。
 * system = 设备自带 TTS（expo-speech），不依赖服务器；
 * server = 服务器合成，仅当服务器配置了非 browser 引擎（game store 的 ttsEnabled）时可用。
 */
import type { TtsEngine } from '@/stores/settings'

/** 当前引擎下朗读（手动按钮 + 自动朗读）是否可用 */
export function ttsAvailableOf(engine: TtsEngine, serverTtsEnabled: boolean): boolean {
  return engine === 'system' || serverTtsEnabled
}

/**
 * 系统引擎长文本分块：Android TTS 引擎有 maxSpeechInputLength 上限（常见 4000 字符），
 * 超长叙事会静默不读。按「段落换行 > 句末标点 > 句中标点 > 硬切」的优先级在窗口内
 * 找最后的边界切开，各块首尾相接还原全文，顺序喂给 expo-speech 排队播放。
 */
export function chunkSpeechText(text: string, maxLen: number): string[] {
  if (maxLen <= 0 || text.length <= maxLen) return [text]
  const boundaries = [/\n/g, /[。！？!?；;]/g, /[，,、：:]/g]
  const chunks: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    const window = rest.slice(0, maxLen)
    let cut = maxLen
    for (const pattern of boundaries) {
      let last = -1
      for (const match of window.matchAll(pattern)) last = match.index + match[0].length
      if (last > 0) {
        cut = last
        break
      }
    }
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest) chunks.push(rest)
  return chunks
}
