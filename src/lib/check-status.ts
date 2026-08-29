import type { CheckResult } from '@/api/types'

export type CheckStatus = 'critical' | 'fumble' | 'success' | 'failure'

/**
 * 检定结果分级：大成功/大失败字段优先，其余按 verdict 文本兜底。
 * 检定卡渲染与触觉推导共用此判定，避免两处标准漂移。
 */
export function checkStatusOf(check: CheckResult): CheckStatus {
  if (check.is_critical) return 'critical'
  if (check.is_fumble) return 'fumble'
  const verdict = String(check.verdict || '').toLowerCase()
  return verdict.includes('成功') || verdict.includes('success') ? 'success' : 'failure'
}
