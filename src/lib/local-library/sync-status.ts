/**
 * 本机项相对某台服务器的同步状态（纯推导，不存脏标记）。
 *
 * 同一张卡推给服务器 A 之后，相对 B 仍是「未推送」：基线按服务器分开记录。
 */
import { EMBEDDED_BOOK_SUFFIX } from './ids'
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

/** 本机列表上的状态标记（只看本机映射，不发网络请求；跨所有服务器汇总） */
export type LocalItemBadge =
  /** 至少在一台跟随的服务器上，本机自上次同步后又改过 */
  | 'unpushed'
  /** 至少一台服务器上的副本已被删除（拉取 / 状态查询发现），本机项仍在 */
  | 'server-deleted'
  /** 服务器声明的锁定（插件卡 / 插件书），本机只读 */
  | 'locked'

type BadgeLink = Pick<ServerLink, 'localId' | 'syncedRevision' | 'remoteDeletedAt'>

/** 按本机 id 分组一次（列表里每项再按 id 取，不必每项都扫一遍全部映射） */
export function groupLinksByLocalId<T extends Pick<ServerLink, 'localId'>>(links: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const link of links) {
    const list = grouped.get(link.localId)
    if (list) list.push(link)
    else grouped.set(link.localId, [link])
  }
  return grouped
}

/**
 * 卡片的内嵌书在服务器上是独立的一本书（`<卡片 id>.book` 映射）：它被删了也算卡「服务器上已删除」
 * ——推送时这本书会一起镜像，用户需要知道。未推送改动只看项本身的映射（内嵌书的基线与卡同步）。
 */
export function localItemBadges(
  item: Pick<LocalItemSummary, 'localId' | 'revision' | 'readOnly' | 'origin'>,
  linksByLocalId: ReadonlyMap<string, readonly BadgeLink[]>,
): LocalItemBadge[] {
  const own = linksByLocalId.get(item.localId) ?? []
  const book = linksByLocalId.get(`${item.localId}${EMBEDDED_BOOK_SUFFIX}`) ?? []
  const badges: LocalItemBadge[] = []
  if (!item.readOnly && own.some((link) => !link.remoteDeletedAt && item.revision > link.syncedRevision)) badges.push('unpushed')
  if ([...own, ...book].some((link) => !!link.remoteDeletedAt)) badges.push('server-deleted')
  if (item.origin?.locked_reason) badges.push('locked')
  return badges
}

/** 推送候选：本机有、且相对这台服务器未同步或改过的可写项（只读项永不推送） */
export function needsPush(item: Pick<LocalItemSummary, 'revision' | 'readOnly'>, link: Pick<ServerLink, 'syncedRevision'> | null): boolean {
  return !item.readOnly && syncStatusOf(item, link) !== 'synced'
}
