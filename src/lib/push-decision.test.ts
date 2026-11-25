import { describe, expect, it } from 'vitest'

import type { CheckResult } from '@/api/types'
import { getT } from '@/i18n/t'

import {
  continueAsFailureFor,
  isSupportedPush,
  pendingPostChecks,
  pushControlsOf,
  pushDecisionReasonText,
  pushRequestBody,
  type CheckPush,
} from './push-decision'

const push = (status: CheckPush['status'], extra: Partial<CheckPush> = {}): CheckPush => ({
  schema_version: 1,
  revision: 3,
  status,
  run_id: 'run-1',
  round: 7,
  reason: '',
  consequence: '',
  ...extra,
})

describe('孤注一掷请求体', () => {
  it('定位字段取自 push；request/reject 带 reason，offer 带 consequence，其余不带文本', () => {
    const base = { run_id: 'run-1', round_number: 7, expected_revision: 3 }
    expect(pushRequestBody(push('pending'), 'request', '换个角度撬锁')).toEqual({ ...base, reason: '换个角度撬锁' })
    expect(pushRequestBody(push('requested'), 'reject', '不合理')).toEqual({ ...base, reason: '不合理' })
    expect(pushRequestBody(push('requested'), 'offer', '惊动守卫')).toEqual({ ...base, consequence: '惊动守卫' })
    expect(pushRequestBody(push('offered'), 'confirm', '残留草稿')).toEqual(base)
    expect(pushRequestBody(push('offered'), 'decline', '残留草稿')).toEqual(base)
  })

  it('只认 schema_version 1', () => {
    expect(isSupportedPush(push('pending'))).toBe(true)
    expect(isSupportedPush({ ...push('pending'), schema_version: 2 })).toBe(false)
    expect(isSupportedPush(undefined)).toBe(false)
  })
})

describe('孤注一掷面板控件', () => {
  const player = { owner: true, isGm: false, adjustingRisk: false }
  const gm = { owner: false, isGm: true, adjustingRisk: false }

  it('pending：归属者写新方法并申请，可接受失败；GM 只看状态', () => {
    expect(pushControlsOf(push('pending'), player)).toMatchObject({ draft: 'reason', request: true, decline: true, review: false })
    expect(pushControlsOf(push('pending'), gm)).toMatchObject({ draft: null, request: false, decline: false, review: false })
  })

  it('requested：GM 写风险并告知/拒绝；归属者只能接受失败', () => {
    expect(pushControlsOf(push('requested'), gm)).toMatchObject({ draft: 'risk', review: true, confirm: false })
    expect(pushControlsOf(push('requested'), player)).toMatchObject({ draft: null, review: false, decline: true, confirm: false })
  })

  it('offered：归属者确认或接受失败；GM 仍可改风险', () => {
    expect(pushControlsOf(push('offered'), player)).toMatchObject({ confirm: true, decline: true, review: false })
    expect(pushControlsOf(push('offered'), gm)).toMatchObject({ draft: 'risk', review: true, confirm: false })
  })

  it('GM 兼归属者在 offered：先给调整开关；打开后换成 GM 审核、隐藏确认', () => {
    const both = { owner: true, isGm: true }
    expect(pushControlsOf(push('offered'), { ...both, adjustingRisk: false }))
      .toMatchObject({ adjustRisk: true, review: false, confirm: true, decline: true, draft: null })
    expect(pushControlsOf(push('offered'), { ...both, adjustingRisk: true }))
      .toMatchObject({ adjustRisk: false, review: true, confirm: false, decline: true, draft: 'risk' })
  })

  it('已结束的状态不给任何操作', () => {
    for (const status of ['resolved', 'declined', 'rejected'] as const) {
      expect(pushControlsOf(push(status), { owner: true, isGm: true, adjustingRisk: false })).toEqual({
        draft: null, request: false, review: false, confirm: false, decline: false, adjustRisk: false,
      })
    }
  })
})

describe('检定选择关闭原因', () => {
  it('翻译系统原因，保留 GM 自填理由', () => {
    const t = getT()
    expect(pushDecisionReasonText('push_timeout', t)).toBe(t('dfPushRollTimedOut'))
    expect(pushDecisionReasonText('luck_timeout', t)).toBe(t('dfPushRollTimedOut'))
    expect(pushDecisionReasonText('gm_forced_advance', t)).toBe(t('dfPushRollForcedAdvance'))
    expect(pushDecisionReasonText('push_disabled_by_gm', t)).toBe(t('dfPushRollDisabled'))
    expect(pushDecisionReasonText('这里不能换一种方式重试', t)).toBe('这里不能换一种方式重试')
    expect(pushDecisionReasonText(undefined, t)).toBe('')
  })
})

describe('检定后待决议并集', () => {
  it('运气与孤注一掷按检定去重，先到为准', () => {
    const a: CheckResult = { check_id: 'a', luck_decision: 'pending' }
    const aPush: CheckResult = { check_id: 'a', push: push('pending') }
    const b: CheckResult = { check_id: 'b', push: push('requested') }
    expect(pendingPostChecks({ pending_luck_decisions: [a], pending_push_decisions: [aPush, b] })).toEqual([a, b])
    expect(pendingPostChecks(null)).toEqual([])
  })

  it('只在结算阶段且有待处理的运气或孤注一掷时启用「按失败继续」', () => {
    const luck = [{ check_id: 'a', luck_decision: 'pending' } satisfies CheckResult]
    const pushes = [{ check_id: 'b', push: push('offered') }]
    expect(continueAsFailureFor({ state: 'active_judgment', pending_luck_decisions: luck })).toBe(true)
    expect(continueAsFailureFor({ state: 'active_judgment', pending_push_decisions: pushes })).toBe(true)
    expect(continueAsFailureFor({ state: 'active_judgment', pending_luck_decisions: [], pending_push_decisions: [] })).toBe(false)
    expect(continueAsFailureFor({ state: 'active_action', pending_push_decisions: pushes })).toBe(false)
    expect(continueAsFailureFor(null)).toBe(false)
  })
})
