/**
 * CoC「孤注一掷」（Push the roll）决议的纯逻辑，对齐上游
 * frontend-v2/src/features/play/check-decisions/（PushDecisionPanel + projection）。
 *
 * 契约：POST /games/{key}/checks/{check_id}/push/{request|offer|reject|decline|confirm}，
 * body 只认 {run_id, round_number, expected_revision, reason?, consequence?}；
 * 三个定位字段取自 check.push（run_id / round / revision），服务端每次变更 revision+1，
 * 拿旧 revision 提交会得到 PUSH_INVALID_OR_STALE。
 * 权限：offer / reject 只给 GM；request / decline / confirm 只给检定归属者（actor_uid）。
 */
import type { CheckResult } from '@/api/types'

import { checkKeyOf } from './check-details'

export type PushOperation = 'request' | 'offer' | 'reject' | 'decline' | 'confirm'
export type CheckPush = NonNullable<CheckResult['push']>
export type PushStatus = CheckPush['status']

export interface PushRequestBody {
  run_id: string
  round_number: number
  expected_revision: number
  reason?: string
  consequence?: string
}

/** 只认 schema_version 1；更高版本按「当前不支持此检定选择」展示，不给操作入口。 */
export function isSupportedPush(push: CheckResult['push']): push is CheckPush {
  return push?.schema_version === 1
}

/** 仍待决议（会阻断叙事推进）的状态。 */
export function isOpenPushStatus(status: PushStatus): boolean {
  return status === 'pending' || status === 'requested' || status === 'offered'
}

export function pushRequestBody(push: CheckPush, operation: PushOperation, draft: string): PushRequestBody {
  const body: PushRequestBody = {
    run_id: push.run_id,
    round_number: push.round,
    expected_revision: push.revision,
  }
  if (operation === 'request' || operation === 'reject') body.reason = draft
  else if (operation === 'offer') body.consequence = draft
  return body
}

/** 面板该给谁显示哪些输入与按钮（与 Web PushDecisionPanel 的模板分支一一对应）。 */
export interface PushControls {
  /** 输入框：归属者写新的尝试方法，或 GM 写失败后果；null = 不显示 */
  draft: 'reason' | 'risk' | null
  request: boolean
  /** GM 的「告知风险」与「拒绝申请」总是成对出现 */
  review: boolean
  confirm: boolean
  decline: boolean
  /** GM 兼归属者且已告知风险：先给「调整失败风险」开关，而不是两套按钮同时摆出 */
  adjustRisk: boolean
}

export function pushControlsOf(
  push: CheckPush,
  { owner, isGm, adjustingRisk }: { owner: boolean; isGm: boolean; adjustingRisk: boolean },
): PushControls {
  const { status } = push
  const ownerOfferedConflict = owner && isGm && status === 'offered'
  const gmReview = (status === 'requested' || status === 'offered') && isGm
    && (!ownerOfferedConflict || adjustingRisk)
  return {
    draft: status === 'pending' && owner ? 'reason' : gmReview ? 'risk' : null,
    request: status === 'pending' && owner,
    review: gmReview,
    confirm: status === 'offered' && owner && (!ownerOfferedConflict || !adjustingRisk),
    decline: isOpenPushStatus(status) && owner,
    adjustRisk: ownerOfferedConflict && !adjustingRisk,
  }
}

/**
 * 检定后待决议的统一来源（对齐上游 pendingPostChecks）：运气 + 孤注一掷并集，
 * 同一检定只留一份。任一非空都意味着叙事要等骰子卡上的选择处理完。
 */
export function pendingPostChecks(detail: {
  pending_luck_decisions?: CheckResult[]
  pending_push_decisions?: CheckResult[]
} | null | undefined): CheckResult[] {
  const merged = new Map<string, CheckResult>()
  for (const check of [...(detail?.pending_luck_decisions ?? []), ...(detail?.pending_push_decisions ?? [])]) {
    const key = checkKeyOf(check)
    if (!merged.has(key)) merged.set(key, check)
  }
  return [...merged.values()]
}
