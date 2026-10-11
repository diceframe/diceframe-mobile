/**
 * 推送入口的纯判定：谁能推送、每个本机项相对当前服务器的同步状态、推送候选的快照。
 */
import type { OwnerAccessStatus } from '@/api/client'
import type { ContentKind, ContentStatusItem } from '@/api/types'
import { EMBEDDED_BOOK_SUFFIX } from '@/lib/local-library/ids'
import type { LocalItem, ServerLink } from '@/lib/local-library/repository'

import type { PushCandidate } from './push-prepare'

/**
 * 推送权限（内容同步仅房主）：
 * - 有房主凭据（访问密码登录或配对设备令牌）→ owner；
 * - 没有房主凭据但 /api/me 放行 → 服务器没有设访问密码（passwordless）：可以推，但推送前
 *   必须明确警告并确认——网络里任何人都能同样写入这台服务器的内容库；
 * - 其余（只有分享/席位凭证的玩家、未登录）→ denied，不显示推送入口。
 */
export type PushAccess = 'owner' | 'passwordless' | 'denied'

export function pushAccess(hasOwnerCredential: boolean, ownerProbe: OwnerAccessStatus): PushAccess {
  if (hasOwnerCredential) return 'owner'
  return ownerProbe === 'allowed' ? 'passwordless' : 'denied'
}

/** 本机项相对一台服务器的同步状态 */
export type LocalSyncState =
  /** 从未推送到这台服务器 */
  | 'never'
  /** 与上次推送/拉取一致，服务器上也没变 */
  | 'in-sync'
  /** 本机改过，服务器没变 */
  | 'local-changes'
  /** 服务器上的副本改过（state_token 变了），本机没变 */
  | 'server-changed'
  /** 两边都改过 */
  | 'both-changed'
  /** 服务器上的副本已被删除 */
  | 'server-deleted'

/**
 * status 为 null 表示这次没查到服务器状态（离线、未查询）：只按本机 revision 判断。
 */
export function localSyncState(
  item: Pick<LocalItem, 'revision'>,
  link: Pick<ServerLink, 'syncedRevision' | 'stateToken'> | null,
  status: Pick<ContentStatusItem, 'exists' | 'state_token'> | null,
): LocalSyncState {
  if (!link) return 'never'
  if (status && !status.exists) return 'server-deleted'
  const local = item.revision > link.syncedRevision
  const server = !!status && status.state_token !== link.stateToken
  if (local && server) return 'both-changed'
  if (local) return 'local-changes'
  if (server) return 'server-changed'
  return 'in-sync'
}

/**
 * 推送候选快照。拉取来源就是这台服务器、但还没有映射的项带 canonical_hint，让推送对准
 * 服务器上原来那一份；「保留两份」得到的副本没有 origin，作为新项推送。
 */
export function pushCandidateOf(item: LocalItem, link: ServerLink | null, serverInstanceId: string): PushCandidate {
  const origin = item.origin
  const hint = !link && origin && origin.server_instance_id === serverInstanceId ? origin.canonical_id : undefined
  return {
    localId: item.localId,
    kind: item.kind,
    name: item.name,
    revision: item.revision,
    readOnly: item.readOnly,
    document: item.document,
    ...(hint ? { canonicalHint: hint } : {}),
  }
}

type LinkLike = Pick<ServerLink, 'localId' | 'canonicalId' | 'syncedRevision' | 'stateToken'>
type SummaryLike = { localId: string; kind: ContentKind; revision: number }
type StatusLike = Pick<ContentStatusItem, 'exists' | 'state_token'>

/** /status 要查的对象：每个有映射的本机项，以及卡片内嵌书（`<卡片 id>.book`）的映射 */
export function statusRefsFor(summaries: readonly SummaryLike[], links: readonly LinkLike[]): { kind: ContentKind; canonical_id: string }[] {
  const byLocal = new Map(links.map((link) => [link.localId, link]))
  const refs: { kind: ContentKind; canonical_id: string }[] = []
  for (const summary of summaries) {
    const link = byLocal.get(summary.localId)
    if (link) refs.push({ kind: summary.kind, canonical_id: link.canonicalId })
    const bookLink = summary.kind === 'character_template' ? byLocal.get(`${summary.localId}${EMBEDDED_BOOK_SUFFIX}`) : undefined
    if (bookLink) refs.push({ kind: 'lorebook', canonical_id: bookLink.canonicalId })
  }
  return refs
}

/**
 * 每个本机项的同步状态；卡片内嵌书在服务器上被改过或被删，也算卡片「服务器有改动」
 * （推送时这本书会一起镜像，用户需要知道）。没查到状态的对象只按本机 revision 判断。
 */
export function pushListStates(
  summaries: readonly SummaryLike[],
  links: readonly LinkLike[],
  statuses: ReadonlyMap<string, StatusLike>,
): Record<string, LocalSyncState> {
  const byLocal = new Map(links.map((link) => [link.localId, link]))
  const states: Record<string, LocalSyncState> = {}
  for (const summary of summaries) {
    const link = byLocal.get(summary.localId) ?? null
    let state = localSyncState(summary, link, link ? statuses.get(link.canonicalId) ?? null : null)
    const bookLink = summary.kind === 'character_template' ? byLocal.get(`${summary.localId}${EMBEDDED_BOOK_SUFFIX}`) : undefined
    const bookStatus = bookLink ? statuses.get(bookLink.canonicalId) : undefined
    const bookChanged = !!bookLink && !!bookStatus && (!bookStatus.exists || bookStatus.state_token !== bookLink.stateToken)
    if (bookChanged) {
      if (state === 'in-sync') state = 'server-changed'
      else if (state === 'local-changes') state = 'both-changed'
    }
    states[summary.localId] = state
  }
  return states
}
