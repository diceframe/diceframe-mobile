/**
 * 真实的列举来源：POST /api/content/list（diceframe/diceframe#508）。分页、CURSOR_INVALID 重来与
 * 429 重试在 api/content.ts 的 listContent 里；这里只把结果换成拉取用的 ref，并处理两种
 * 「不是错误」的情况：
 * - 400 KIND_NOT_SUPPORTED（服务器没启用 Lorebook 等）：这一类为空，附提示；
 * - 裸 404/405（CONTENT_SYNC_UNSUPPORTED，旧服务端没有 /list）：退回本机已跟随的项，附提示
 *   「只能刷新已跟随的项」。
 * 其余错误（OWNER_REQUIRED、SERVER_MISMATCH、SERVER_IDENTITY_UNAVAILABLE…）原样抛出。
 */
import type { ContentKind, ContentListItem } from '@/api/types'

import type { ServerItemRef, ServerItemSource, ServerListing } from './pull-session'

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : ''
}

export function listItemRef(item: ContentListItem): ServerItemRef {
  return {
    kind: item.kind,
    canonicalId: item.canonical_id,
    name: item.name,
    stateToken: item.state_token,
    ...(item.locked_reason ? { lockedReason: item.locked_reason } : {}),
  }
}

export function contentListSource(
  listAll: (kind: ContentKind) => Promise<ContentListItem[]>,
  fallback: ServerItemSource,
): ServerItemSource {
  return {
    list: async (kind): Promise<ServerListing> => {
      try {
        return { items: (await listAll(kind)).map(listItemRef) }
      } catch (error) {
        const code = codeOf(error)
        if (code === 'KIND_NOT_SUPPORTED') return { items: [], notice: 'KIND_NOT_SUPPORTED' }
        if (code === 'CONTENT_SYNC_UNSUPPORTED') return { items: (await fallback.list(kind)).items, notice: 'TRACKED_ONLY' }
        throw error
      }
    },
  }
}
