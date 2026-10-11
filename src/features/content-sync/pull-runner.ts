/**
 * 拉取的运行时装配：把真实的导出 / 状态 API 与本机库接进 PullSession。
 *
 * 「列出服务器上有哪些内容」只有 ServerItemSource 接口，这里不提供真实实现：服务端现有的
 * 书列表不含绑定到世界/对局的书，列举接口待服务端确定后再接。目前能用的来源只有
 * 本机已跟随的项（linkedItemRefs，重新拉取）。
 */
import { randomUUID } from 'expo-crypto'

import { assertContentServer, contentStatus, exportContent } from '@/api/content'
import { createYielder } from '@/lib/local-library/yielder'

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
      if (!refs.length) return refs
      const statuses = await contentStatus(server, refs.map((ref) => ({ kind: ref.kind, canonical_id: ref.canonicalId })))
      const tokens = new Map(statuses.filter((status) => status.exists).map((status) => [status.canonical_id, status.state_token]))
      return refs.map((ref) => (tokens.has(ref.canonicalId) ? { ...ref, stateToken: tokens.get(ref.canonicalId) } : ref))
    },
  }
}
