/**
 * 自动朗读的到达判定（对齐 Web GameTimeline 的 autoSpeak watch 语义）：
 * 只看最新一条回合日志，签名 = 回合号 + GM 叙事全文，用来防重复朗读
 * （SSE 刷新、加载更早回合都不会改变最新签名）。
 */
import type { LogEntry } from '@/api/types'

export interface AutoSpeakPick {
  /** 最新叙事的签名，调用方存起来做下一轮比较 */
  signature: string
  /** 待朗读的 GM 叙事全文 */
  text: string
  /** true = 首次拿到日志只记基线，不发声（进对局不回放历史叙事） */
  baseline: boolean
}

export function pickAutoSpeak(log: LogEntry[], lastSignature: string): AutoSpeakPick | null {
  const newest = log[log.length - 1]
  if (!newest?.gm_response) return null
  const text = String(newest.gm_response)
  if (!text.trim()) return null
  const signature = `${newest.round ?? ''}:${text}`
  if (signature === lastSignature) return null
  return { signature, text, baseline: lastSignature === '' }
}
