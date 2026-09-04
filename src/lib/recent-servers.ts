import { normalizeBaseUrl } from '@/api/client'

/**
 * 生成本机服务器 MRU 列表：标准化、去重，完整保留并按最近使用排序。
 * candidates 按优先级传入，越靠前越靠近列表顶部。
 */
export function updateRecentServers(
  recent: readonly string[],
  ...candidates: (string | null | undefined)[]
): string[] {
  const result: string[] = []
  for (const raw of [...candidates, ...recent]) {
    if (typeof raw !== 'string') continue
    const normalized = normalizeBaseUrl(raw)
    if (!normalized || result.includes(normalized)) continue
    result.push(normalized)
  }
  return result
}
