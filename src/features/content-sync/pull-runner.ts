/**
 * 拉取的运行时装配：把真实的列举 / 导出 / 状态 API 与本机库接进 PullSession。
 * 列举走 POST /api/content/list（serverItemSource）；旧服务端没有它时退回本机已跟随的项。
 */
import { randomUUID } from 'expo-crypto'

import { assertContentServer, contentStatus, exportContent, listContent } from '@/api/content'
import { getT } from '@/i18n/t'
import { createYielder } from '@/lib/local-library/yielder'

import { contentListSource } from './list-source'
import { PullSession, linkedItemRefs, type ServerItemRef, type ServerItemSource } from './pull-session'
import type { PushContext } from './push-runner'

/** 拉取与推送共用同一个上下文（仅房主、锁定服务器、本机库） */
export type PullContext = PushContext

export function createPullSession(context: PullContext, refs: readonly ServerItemRef[]): PullSession {
  const { library, server } = context
  return new PullSession({
    serverInstanceId: server.serverInstanceId,
    baseUrlHint: server.baseUrl,
    exportItems: (items) => exportContent(server, items),
    status: (items) => contentStatus(server, items),
    assertServer: () => assertContentServer(server),
    library,
    uuid: randomUUID,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maybeYield: createYielder(),
    copySuffix: (n) => (n === 1 ? getT()('dfLocalCopySuffix') : getT()('dfLocalCopySuffixN', { n })),
  }, refs)
}

/**
 * 本机已跟随这台服务器的项（重新拉取）；不依赖服务端列举。服务器上的 state_token 经 /status
 * 查（服务器上已删的不带 token，拉取时会被标记）。
 */
export function linkedItemSource(context: PullContext): ServerItemSource {
  const { library, server } = context
  return {
    list: async (kind) => {
      const refs = linkedItemRefs(library.listItems({ kind }), library.listLinks(server.serverInstanceId))
      if (!refs.length) return { items: refs }
      const statuses = await contentStatus(server, refs.map((ref) => ({ kind: ref.kind, canonical_id: ref.canonicalId })))
      const tokens = new Map(statuses.filter((status) => status.exists).map((status) => [status.canonical_id, status.state_token]))
      return { items: refs.map((ref) => (tokens.has(ref.canonicalId) ? { ...ref, stateToken: tokens.get(ref.canonicalId) } : ref)) }
    },
  }
}

/** 拉取界面用的来源：服务端列举（#508），旧服务端退回 linkedItemSource */
export function serverItemSource(context: PullContext): ServerItemSource {
  return contentListSource((kind) => listContent(context.server, kind), linkedItemSource(context))
}
