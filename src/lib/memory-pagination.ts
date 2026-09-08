import type { MemoryRecord } from '@/api/library'

export const MEMORY_PAGE_SIZE = 50

export interface MemoryPageResponse {
  memories?: MemoryRecord[]
  entries?: MemoryRecord[]
  total?: number
}

export interface MemoryPaginationState {
  gameKey: string
  keyword: string
  page: number
  memories: MemoryRecord[]
  total: number | null
  loading: boolean
  error: string
  requestId: number
  contextId: number
}

export type MemoryPaginationAction =
  | { type: 'game'; gameKey: string }
  | { type: 'search'; keyword: string }
  | { type: 'page'; page: number }
  | { type: 'refresh'; contextId?: number }
  | { type: 'mutationFailure'; contextId: number; error: string }
  | { type: 'success'; requestId: number; response: MemoryPageResponse }
  | { type: 'failure'; requestId: number; error: string }

export function createMemoryPagination(): MemoryPaginationState {
  return {
    gameKey: '', keyword: '', page: 1, memories: [], total: null,
    loading: false, error: '', requestId: 0, contextId: 0,
  }
}

export function memoryPageMeta(state: MemoryPaginationState) {
  const total = state.total ?? 0
  const pages = Math.max(1, Math.ceil(total / MEMORY_PAGE_SIZE))
  const offset = (state.page - 1) * MEMORY_PAGE_SIZE
  const start = total > 0 && state.memories.length > 0 ? offset + 1 : 0
  const end = start ? Math.min(offset + state.memories.length, total) : 0
  return { total, pages, offset, start, end }
}

function requestPage(state: MemoryPaginationState): MemoryPaginationState {
  return { ...state, loading: !!state.gameKey, error: '', requestId: state.requestId + 1 }
}

export function memoryPaginationReducer(
  state: MemoryPaginationState,
  action: MemoryPaginationAction,
): MemoryPaginationState {
  switch (action.type) {
    case 'game':
      return requestPage({
        ...createMemoryPagination(), gameKey: action.gameKey, requestId: state.requestId,
        contextId: state.contextId + (action.gameKey !== state.gameKey || state.keyword !== '' ? 1 : 0),
      })
    case 'search': {
      const keyword = action.keyword.trim()
      return requestPage({
        ...state, keyword, page: 1, memories: [], total: null,
        contextId: state.contextId + (keyword !== state.keyword ? 1 : 0),
      })
    }
    case 'page': {
      const { pages } = memoryPageMeta(state)
      if (state.loading || !Number.isInteger(action.page) || action.page < 1 || action.page > pages || action.page === state.page) return state
      return requestPage({ ...state, page: action.page, memories: [] })
    }
    case 'refresh':
      // 同一对局/查询的并发读取不能吞掉写后刷新；切走再切回也属于新上下文。
      if (action.contextId !== undefined && action.contextId !== state.contextId) return state
      return requestPage(state)
    case 'mutationFailure':
      if (action.contextId !== state.contextId) return state
      return { ...state, error: action.error }
    case 'failure':
      if (action.requestId !== state.requestId) return state
      return { ...state, loading: false, error: action.error }
    case 'success': {
      if (action.requestId !== state.requestId) return state
      const memories = action.response.memories ?? action.response.entries ?? []
      const offset = (state.page - 1) * MEMORY_PAGE_SIZE
      const reportedTotal = action.response.total
      // 正常服务端始终返回 total；缺失时仅采用已知记录范围，不虚构下一页。
      const total = typeof reportedTotal === 'number' && Number.isFinite(reportedTotal) && reportedTotal >= 0
        ? Math.floor(reportedTotal)
        : offset + memories.length
      const lastPage = Math.max(1, Math.ceil(total / MEMORY_PAGE_SIZE))
      if (state.page > lastPage) {
        // 删除末页最后一条或远端批量删除后，必须重新取有效页，不能只改页码。
        return requestPage({ ...state, total, page: lastPage, memories: [] })
      }
      return { ...state, memories: total === 0 ? [] : memories, total, loading: false, error: '' }
    }
  }
}
