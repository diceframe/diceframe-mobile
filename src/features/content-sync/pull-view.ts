/**
 * 拉取界面的纯推导：选择列表里每个服务器项相对本机的状态、进度。
 */
import { EMBEDDED_BOOK_SUFFIX } from '@/lib/local-library/ids'

import { UNSUPPORTED_LOCKS, type PullLibrary, type PullOutcome, type ServerItemRef } from './pull-session'
import { localSyncState, type LocalSyncState } from './sync-state'

export type PullRowState =
  /** 本机没有跟随它的项：拉取会新建 */
  | 'new'
  /** 本机已作为某张卡的内嵌书跟随：拉取会跳过 */
  | 'embedded'
  /** 服务器声明不能导入本机（规则托管卡） */
  | 'unsupported'
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
    if (ref.lockedReason && UNSUPPORTED_LOCKS.has(ref.lockedReason)) return { ref, state: 'unsupported' }
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

/** 可勾选：内嵌书跟随的项拉取时一定跳过、规则托管卡不能导入，都不给选 */
export function isSelectable(row: PullListRow): boolean {
  return row.state !== 'embedded' && row.state !== 'unsupported'
}

/**
 * 服务器上的这一项由别的来源跟随（另一台设备、其他导入来源）：契约里 TRACKED_BY_OTHER_SOURCE /
 * DETACHED_FROM_OTHER_SOURCE 不进 locked_reason，要按 provenance 自己推导——拉下来改过再推送时，
 * 服务端只给「保留两份 / 跳过」。来源就是本安装的不算。
 */
export function syncedByOtherSource(ref: Pick<ServerItemRef, 'provenance'>, deviceSourceId: string): boolean {
  const provenance = ref.provenance
  if (!provenance) return false
  const kind = String(provenance.source_kind ?? '')
  const id = String(provenance.source_id ?? '')
  if (!kind && !id) return false
  return !(kind === 'device' && id === deviceSourceId)
}

/** 进度：已出结果的项数 / 总项数 */
export function pullProgress(outcomes: readonly Pick<PullOutcome, 'status'>[]): { done: number; total: number } {
  return { done: outcomes.filter((outcome) => outcome.status !== 'pending').length, total: outcomes.length }
}
