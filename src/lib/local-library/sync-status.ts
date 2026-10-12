/**
 * 本机项相对某台服务器的同步状态（纯推导，不存脏标记）。
 *
 * 同一张卡推给服务器 A 之后，相对 B 仍是「未推送」：基线按服务器分开记录。
 */
import type { LocalItemSummary, ServerLink } from './repository'

export type SyncStatus =
  /** 这台服务器上没有对应项（从未推送/拉取过） */
  | 'local-only'
  /** 与上次推送/拉取一致 */
  | 'synced'
  /** 上次同步后本机又改过 */
  | 'modified'

export function syncStatusOf(item: Pick<LocalItemSummary, 'revision'>, link: Pick<ServerLink, 'syncedRevision'> | null): SyncStatus {
  if (!link) return 'local-only'
  return item.revision > link.syncedRevision ? 'modified' : 'synced'
}

/** 推送候选：本机有、且相对这台服务器未同步或改过的可写项（只读项永不推送） */
export function needsPush(item: Pick<LocalItemSummary, 'revision' | 'readOnly'>, link: Pick<ServerLink, 'syncedRevision'> | null): boolean {
  return !item.readOnly && syncStatusOf(item, link) !== 'synced'
}
