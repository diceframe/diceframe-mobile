/**
 * 推送的运行时装配：锁定服务器、取 install id、读本机项与映射、查服务器状态，
 * 把真实的 API 与本机库接进 PushSession。纯逻辑都在 push-prepare / push-session / sync-state。
 */
import { checkOwnerAccess, currentToken } from '@/api/client'
import {
  ContentSyncError,
  OWNER_REQUIRED,
  assertContentServer,
  commitImport,
  contentStatus,
  previewImport,
  resolveContentServer,
  type ContentServer,
} from '@/api/content'
import type { ContentStatusItem } from '@/api/types'
import type { LocalItemSummary, LocalLibraryRepository } from '@/lib/local-library/repository'
import { createYielder } from '@/lib/local-library/yielder'
import { localLibrary, resolveInstallId } from '@/stores/local-library'

import { batchPush, preparePush } from './push-prepare'
import { PushSession } from './push-session'
import { localSyncState, pushAccess, pushCandidateOf, type LocalSyncState, type PushAccess } from './sync-state'

/** 推送入口是否可见（不做任何内容同步请求，只看凭据与 /api/me） */
export async function currentPushAccess(): Promise<PushAccess> {
  const hasOwnerCredential = !!currentToken()
  return pushAccess(hasOwnerCredential, hasOwnerCredential ? 'allowed' : await checkOwnerAccess())
}

export interface PushContext {
  access: PushAccess
  server: ContentServer
  /** 推送声明的 device source id（= resolveInstallId() 的结果，本机库 meta 为准） */
  deviceSourceId: string
  library: LocalLibraryRepository
}

/** 进入推送：只有房主（或没设访问密码的服务器）能走到这里 */
export async function openPushContext(): Promise<PushContext> {
  const access = await currentPushAccess()
  if (access === 'denied') throw new ContentSyncError(OWNER_REQUIRED, 'owner credential required')
  const library = await localLibrary()
  const deviceSourceId = await resolveInstallId()
  if (!library || !deviceSourceId) throw new ContentSyncError('CONTENT_SYNC_UNSUPPORTED', 'local library is not available')
  const server = await resolveContentServer()
  return { access, server, deviceSourceId, library }
}

export interface PushListItem {
  summary: LocalItemSummary
  syncState: LocalSyncState
}

/**
 * 可推送的本机项与各自的同步状态。有映射的项经 /api/content/status 查服务器上的
 * state_token（旧服务端退化为批量导出）；查不到时只按本机 revision 判断。
 */
export async function loadPushList(context: PushContext): Promise<PushListItem[]> {
  const { library, server } = context
  const summaries = library.listItems()
  const links = new Map(library.listLinks(server.serverInstanceId).map((link) => [link.localId, link]))
  const refs = summaries
    .map((summary) => links.get(summary.localId))
    .filter((link): link is NonNullable<typeof link> => !!link)
    .map((link) => ({
      kind: summaries.find((summary) => summary.localId === link.localId)!.kind,
      canonical_id: link.canonicalId,
    }))
  let statuses: ContentStatusItem[] = []
  try {
    statuses = refs.length ? await contentStatus(server, refs) : []
  } catch {
    statuses = []
  }
  const byCanonical = new Map(statuses.map((status) => [status.canonical_id, status]))
  return summaries.map((summary) => {
    const link = links.get(summary.localId) ?? null
    return { summary, syncState: localSyncState(summary, link, link ? byCanonical.get(link.canonicalId) ?? null : null) }
  })
}

/** 为选中的本机项建推送会话（文档按此刻快照） */
export function createPushSession(context: PushContext, localIds: readonly string[]): PushSession {
  const { library, server, deviceSourceId } = context
  const candidates = localIds
    .map((localId) => library.getItem(localId))
    .filter((item): item is NonNullable<typeof item> => !!item)
    .map((item) => pushCandidateOf(item, library.getLink(server.serverInstanceId, item.localId), server.serverInstanceId))
  const source = { kind: 'device' as const, id: deviceSourceId }
  const { prepared, excluded } = preparePush(candidates)
  return new PushSession({
    preview: (items) => previewImport({ server, source, items }),
    commit: (items, planDigest, decisions) => commitImport({ server, source, items, planDigest, decisions }),
    assertServer: () => assertContentServer(server),
    record: (write) => {
      library.recordSync(server.serverInstanceId, [{
        localId: write.clientRef,
        canonicalId: write.canonicalId,
        stateToken: write.stateToken,
        syncedRevision: write.revision,
        syncedDigest: write.digest,
        baseUrlHint: server.baseUrl,
      }])
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maybeYield: createYielder(),
  }, batchPush(prepared, source), excluded)
}
