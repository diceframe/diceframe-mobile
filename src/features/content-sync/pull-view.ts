/**
 * 拉取界面的纯推导：选择列表里每个服务器项相对本机的状态、进度。
 */
import { EMBEDDED_BOOK_SUFFIX } from '@/lib/local-library/ids'

import type { PullLibrary, PullOutcome, ServerItemRef } from './pull-session'
import { localSyncState, type LocalSyncState } from './sync-state'

export type PullRowState =
  /** 本机没有跟随它的项：拉取会新建 */
  | 'new'
  /** 本机已作为某张卡的内嵌书跟随：拉取会跳过 */
  | 'embedded'
  | Exclude<LocalSyncState, 'never'>

export interface PullListRow {
  ref: ServerItemRef
  state: PullRowState
  /** 本机对应项 */
  localId?: string
}

/**
 * 列表行状态。列举结果带 state_token 时与映射比较得出服务器是否改过；没带时只按本机
 * revision 判断（与推送列表同一套 localSyncState）。
 */
export function pullListRows(
  refs: readonly ServerItemRef[],
  library: Pick<PullLibrary, 'findByCanonical' | 'getItem'>,
  serverInstanceId: string,
): PullListRow[] {
  return refs.map((ref) => {
    const link = library.findByCanonical(serverInstanceId, ref.canonicalId)
    if (!link) return { ref, state: 'new' }
    if (link.localId.endsWith(EMBEDDED_BOOK_SUFFIX)) {
      return { ref, state: 'embedded', localId: link.localId.slice(0, -EMBEDDED_BOOK_SUFFIX.length) }
    }
    const item = library.getItem(link.localId)
    if (!item) return { ref, state: 'new' }
    const status = ref.stateToken !== undefined ? { exists: true, state_token: ref.stateToken } : null
    const state = localSyncState(item, link, status)
    return { ref, state: state === 'never' ? 'new' : state, localId: item.localId }
  })
}

/** 可勾选：内嵌书跟随的项拉取时一定跳过，不给选 */
export function isSelectable(row: PullListRow): boolean {
  return row.state !== 'embedded'
}

/** 进度：已出结果的项数 / 总项数 */
export function pullProgress(outcomes: readonly Pick<PullOutcome, 'status'>[]): { done: number; total: number } {
  return { done: outcomes.filter((outcome) => outcome.status !== 'pending').length, total: outcomes.length }
}
