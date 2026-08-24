import type { LogEntry } from '@/api/types'

export type GameStateBadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'info'

const STATE_LABELS: Record<string, string> = {
  setup: '准备中',
  waiting: '等待行动',
  action: '行动阶段',
  active_action: '行动阶段',
  resolving: '结算中',
  active_judgment: 'GM 思考中',
  paused: '已暂停',
  ended: '已结束',
}

const STATE_VARIANTS: Record<string, GameStateBadgeVariant> = {
  active_action: 'success',
  action: 'success',
  active_judgment: 'warning',
  resolving: 'warning',
  waiting: 'secondary',
  setup: 'info',
  paused: 'secondary',
  ended: 'default',
}

export function gameStateLabel(state?: string): string {
  if (!state) return '未知状态'
  return STATE_LABELS[state] ?? state
}

export function gameStateVariant(state?: string): GameStateBadgeVariant {
  return STATE_VARIANTS[state ?? ''] ?? 'secondary'
}

/**
 * 判断两次拉取之间是否写入了新回合：按最新条目的 round 比较。
 * log 第一页满员后，新条目会把旧条目挤到下一页、数组长度不再增长，
 * 不能用长度判断——否则流式“GM 思考中”气泡在正式输出落地后不会清除。
 */
export function hasNewRound(
  previous: LogEntry[] | undefined,
  next: LogEntry[] | undefined,
): boolean {
  const lastRound = (entries: LogEntry[] | undefined) => entries?.[entries.length - 1]?.round
  return lastRound(next) !== lastRound(previous)
}
