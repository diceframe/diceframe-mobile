/**
 * 快捷行动建议的个人显隐（对齐上游 useQuickActionVisibility）：
 * 玩家自己的选择优先；没选过就跟随桌面默认 GameDetail.quick_actions_enabled（缺省视为显示）。
 * 上游按 [gameKey, actorId] 存 localStorage；移动端可切服务器，键里多带 baseUrl。
 */

/** 记忆条数上限：超出时丢最早写入的，避免持久化设置无限增长 */
export const QUICK_ACTION_MEMORY_LIMIT = 100

export function quickActionVisibilityKey(baseUrl: string, gameKey: string, actorId: string): string {
  return JSON.stringify([baseUrl, gameKey, actorId])
}

export function quickActionsVisible(personal: boolean | undefined, tableDefault: boolean | undefined): boolean {
  return personal ?? tableDefault !== false
}

/** 写入一条选择（重新写入的键移到末尾），超过上限时裁掉最早的。 */
export function rememberQuickActionVisibility(
  memory: Record<string, boolean>,
  key: string,
  visible: boolean,
  limit = QUICK_ACTION_MEMORY_LIMIT,
): Record<string, boolean> {
  const entries = Object.entries(memory).filter(([existing]) => existing !== key)
  entries.push([key, visible])
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - limit)))
}
