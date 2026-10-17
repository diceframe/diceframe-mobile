import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'

import { actionRecoveryOf, afterRecoveryRefresh } from './action-recovery'

describe('行动提交失败恢复', () => {
  it('回滚可编辑；已入账与未处理须先刷新', () => {
    expect(actionRecoveryOf(new ApiError('x', 500, 'ROUND_PROCESSING_FAILED'))).toMatchObject({ code: 'ROUND_PROCESSING_FAILED', kind: 'editable' })
    expect(actionRecoveryOf(new ApiError('x', 500, 'round_post_commit_failed'))).toMatchObject({ code: 'ROUND_POST_COMMIT_FAILED', kind: 'refresh' })
    expect(actionRecoveryOf(new ApiError('x', 409, 'ROUND_NOT_PROCESSED'))).toMatchObject({ code: 'ROUND_NOT_PROCESSED', kind: 'refresh' })
  })

  it('结果不确定的失败按未知处理；明确拒收的 4xx 不进恢复', () => {
    expect(actionRecoveryOf(new Error('Network request failed'))).toMatchObject({ code: 'UNKNOWN', kind: 'refresh' })
    expect(actionRecoveryOf(new ApiError('x', 502))).toMatchObject({ code: 'UNKNOWN', kind: 'refresh' })
    expect(actionRecoveryOf(new ApiError('x', 409, 'ECONOMY_DECISION_PENDING'))).toBeNull()
    expect(actionRecoveryOf(new ApiError('x', 400))).toBeNull()
  })

  it('刷新后：已入账清空草稿并结束，其余转可编辑并标记已核对', () => {
    const postCommit = actionRecoveryOf(new ApiError('x', 500, 'ROUND_POST_COMMIT_FAILED'))!
    expect(afterRecoveryRefresh(postCommit)).toEqual({ clearDraft: true, next: null })
    const unknown = actionRecoveryOf(new Error('timeout'))!
    expect(afterRecoveryRefresh(unknown)).toEqual({ clearDraft: false, next: { code: 'UNKNOWN', kind: 'editable', confirmed: true } })
  })
})
