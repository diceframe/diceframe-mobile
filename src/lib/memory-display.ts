import type { MemoryRecord } from '@/api/library'

/**
 * 记忆卡展示文本：entity · relation · value 拼接。
 * 服务端抽取偶尔把整句事实同时写进 entity 与 value，直接拼接会整段复读；
 * 互相包含的片段只保留更完整的一份（较长者替换较短者），空片段始终跳过。
 */
export function memoryDisplayText(item: MemoryRecord): string {
  const value = String(item.value || item.content || item.text || item.summary || '')
  const kept: string[] = []
  for (const part of [String(item.entity || ''), String(item.relation || ''), value]) {
    if (!part) continue
    const contained = kept.findIndex((seen) => part.includes(seen) || seen.includes(part))
    if (contained < 0) {
      kept.push(part)
    } else if (kept[contained].length < part.length) {
      kept[contained] = part
    }
  }
  return kept.join(' · ')
}
