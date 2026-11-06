import type { GameSummary } from '@/api/types'

export type GameSortMode = 'recent' | 'oldest' | 'name' | 'round'

function activityTime(game: GameSummary): number | null {
  for (const value of [game.last_activity, game.started_at]) {
    if (!value) continue
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return null
}

/** 存档排序（对齐 Web overview/saveSorting）：没有时间的排在最后，同分按名字 */
export function sortGames(games: readonly GameSummary[], mode: GameSortMode): GameSummary[] {
  return [...games].sort((left, right) => {
    const nameA = String(left.world_name || left.game_key)
    const nameB = String(right.world_name || right.game_key)
    if (mode === 'name') return nameA.localeCompare(nameB)
    if (mode === 'round') {
      const diff = Number(right.round_number || 0) - Number(left.round_number || 0)
      if (diff !== 0) return diff
    }
    const aTime = activityTime(left)
    const bTime = activityTime(right)
    if (aTime === null && bTime === null) return nameA.localeCompare(nameB)
    if (aTime === null) return 1
    if (bTime === null) return -1
    const oldestFirst = mode === 'oldest'
    const diff = oldestFirst ? aTime - bTime : bTime - aTime
    if (diff !== 0) return diff
    return nameA.localeCompare(nameB)
  })
}

/**
 * 首页顶部「最近 / 进行中的冒险」：与 Web 一样固定取最近活动的那一局，
 * 不跟随下方列表当前选的排序方式。
 */
export function featuredGame(games: readonly GameSummary[]): GameSummary | null {
  return sortGames(games, 'recent')[0] ?? null
}
