/**
 * 行动提交失败后的恢复判定（对齐上游 features/play/recovery + ActionComposer 的 codeOf/showRecovery）。
 *
 * - ROUND_PROCESSING_FAILED：本轮处理失败已回滚到行动阶段，草稿可改后重发（editable）；
 * - ROUND_POST_COMMIT_FAILED：行动已入账、回合可能已推进——刷新后清空草稿，绝不能重发；
 * - ROUND_NOT_PROCESSED 与结果不确定的失败（断网、超时、5xx、未知码）：先刷新核对再决定。
 *
 * 移动端调整：服务端明确拒收的 4xx（校验失败、经济决议待处理等）本就没有副作用，
 * 沿用原有顶部错误横幅、草稿可直接改，不进恢复流程。
 */
import { ApiError } from '@/api/client'

export type ActionRecoveryCode = 'ROUND_PROCESSING_FAILED' | 'ROUND_POST_COMMIT_FAILED' | 'ROUND_NOT_PROCESSED' | 'UNKNOWN'

export interface ActionRecovery {
  code: ActionRecoveryCode
  /** refresh = 刷新前锁住输入；editable = 可以编辑草稿 */
  kind: 'editable' | 'refresh'
  /** 刷新已完成（editable 且 confirmed 时展示「刷新完成，请先核对」） */
  confirmed: boolean
}

const ROUND_CODES = new Set<string>(['ROUND_PROCESSING_FAILED', 'ROUND_POST_COMMIT_FAILED', 'ROUND_NOT_PROCESSED'])

export function actionRecoveryOf(error: unknown): ActionRecovery | null {
  const code = error instanceof ApiError ? (error.code ?? '').toUpperCase() : ''
  if (ROUND_CODES.has(code)) {
    const known = code as ActionRecoveryCode
    return { code: known, kind: known === 'ROUND_PROCESSING_FAILED' ? 'editable' : 'refresh', confirmed: false }
  }
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return null
  return { code: 'UNKNOWN', kind: 'refresh', confirmed: false }
}

/** 刷新完成后的下一步：已入账的行动清空草稿并结束恢复，其余转为可编辑并提示先核对。 */
export function afterRecoveryRefresh(recovery: ActionRecovery): { clearDraft: boolean; next: ActionRecovery | null } {
  if (recovery.code === 'ROUND_POST_COMMIT_FAILED') return { clearDraft: true, next: null }
  return { clearDraft: false, next: { ...recovery, kind: 'editable', confirmed: true } }
}
