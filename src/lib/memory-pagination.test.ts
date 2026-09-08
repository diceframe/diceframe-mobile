import { describe, expect, it } from 'vitest'

import {
  createMemoryPagination,
  MEMORY_PAGE_SIZE,
  memoryPageMeta,
  memoryPaginationReducer as reduce,
  type MemoryPaginationState,
} from './memory-pagination'

const entries = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => ({ id: offset + index + 1 }))
const game = () => reduce(createMemoryPagination(), { type: 'game', gameKey: 'guild#42' })
const success = (state: MemoryPaginationState, total: number, count = Math.min(total, MEMORY_PAGE_SIZE)) => reduce(state, {
  type: 'success', requestId: state.requestId,
  response: { memories: entries(count, (state.page - 1) * MEMORY_PAGE_SIZE), total },
})
const secondPage = () => success(reduce(success(game(), 101), { type: 'page', page: 2 }), 101)
const lastPage = () => success(reduce(secondPage(), { type: 'page', page: 3 }), 101, 1)

describe('记忆档案分页', () => {
  it('明确每页 50 条，初次请求不将未知 total 当作已知空数据', () => {
    const state = game()
    expect(MEMORY_PAGE_SIZE).toBe(50)
    expect(state).toMatchObject({ page: 1, total: null, loading: true, memories: [] })
    expect(memoryPageMeta(state)).toEqual({ total: 0, pages: 1, offset: 0, start: 0, end: 0 })
  })

  it('后续页按 offset 50、100 请求，展示实际条目范围和 total', () => {
    expect(memoryPageMeta(secondPage())).toEqual({ total: 101, pages: 3, offset: 50, start: 51, end: 100 })
    expect(memoryPageMeta(lastPage())).toEqual({ total: 101, pages: 3, offset: 100, start: 101, end: 101 })
  })

  it('翻页立即清空旧页内容，返回上一页后需要重新加载', () => {
    const state = reduce(lastPage(), { type: 'page', page: 2 })
    expect(state).toMatchObject({ page: 2, memories: [], total: 101, loading: true })
    expect(memoryPageMeta(success(state, 101)).start).toBe(51)
  })

  it('提交搜索会 trim 并回到首页，即使重复提交同一关键词也重新请求', () => {
    const original = lastPage()
    const searched = reduce(original, { type: 'search', keyword: '  公爵  ' })
    expect(searched).toMatchObject({ gameKey: 'guild#42', keyword: '公爵', page: 1, total: null, memories: [], loading: true })
    const repeat = reduce(searched, { type: 'search', keyword: '公爵' })
    expect(repeat.requestId).toBeGreaterThan(searched.requestId)
    expect(reduce(success(repeat, 2), { type: 'search', keyword: '' })).toMatchObject({ keyword: '', page: 1, total: null })
  })

  it('切换对局清空搜索与分页并使旧响应失效，包括切走后再切回同一对局', () => {
    const old = reduce(lastPage(), { type: 'search', keyword: '公爵' })
    const switched = reduce(old, { type: 'game', gameKey: 'other' })
    const returned = reduce(switched, { type: 'game', gameKey: old.gameKey })
    expect(switched).toMatchObject({ gameKey: 'other', keyword: '', page: 1, total: null, memories: [], error: '' })
    expect(reduce(returned, { type: 'success', requestId: old.requestId, response: { memories: entries(10), total: 10 } })).toBe(returned)
    expect(reduce(returned, { type: 'failure', requestId: old.requestId, error: '旧请求错误' })).toBe(returned)
  })

  it('搜索/翻页/刷新之后的过期成功和失败都不能串页或提前结束 loading', () => {
    const old = secondPage()
    const candidates = [
      reduce(old, { type: 'search', keyword: '银塔' }),
      reduce(old, { type: 'page', page: 3 }),
      reduce(old, { type: 'refresh' }),
    ]
    for (const current of candidates) {
      expect(reduce(current, { type: 'success', requestId: old.requestId, response: { total: 0 } })).toBe(current)
      expect(reduce(current, { type: 'failure', requestId: old.requestId, error: '过期' })).toBe(current)
      expect(current.loading).toBe(true)
    }
  })

  it('删除末页唯一条目后请求前一有效页，不能把空响应当成前页内容', () => {
    const original = lastPage()
    const refresh = reduce(original, { type: 'refresh', contextId: original.contextId })
    const corrected = success(refresh, 100, 0)
    expect(corrected).toMatchObject({ page: 2, total: 100, memories: [], loading: true })
    expect(corrected.requestId).toBeGreaterThan(refresh.requestId)
    expect(success(corrected, 100)).toMatchObject({ page: 2, loading: false, total: 100 })
    expect(memoryPageMeta(success(corrected, 100)).start).toBe(51)
  })

  it('刷新保留当前页和搜索，远端批量删除则直接跳回最后有效页', () => {
    const searched = success(reduce(game(), { type: 'search', keyword: '银塔' }), 101)
    const state = success(reduce(searched, { type: 'page', page: 2 }), 101)
    const refreshed = reduce(state, { type: 'refresh' })
    expect(refreshed).toMatchObject({ page: 2, keyword: '银塔', memories: state.memories, loading: true })
    expect(success(refreshed, 130).page).toBe(2)
    const clamped = success(reduce(lastPage(), { type: 'refresh' }), 8, 0)
    expect(clamped).toMatchObject({ page: 1, total: 8, memories: [], loading: true })
    expect(success(clamped, 8).memories).toHaveLength(8)
  })

  it('全部删除后返回首页并显示 total 0、范围 0-0', () => {
    const corrected = success(reduce(lastPage(), { type: 'refresh' }), 0, 0)
    const settled = success(corrected, 0, 0)
    expect(settled).toMatchObject({ page: 1, total: 0, memories: [], loading: false })
    expect(memoryPageMeta(settled)).toEqual({ total: 0, pages: 1, offset: 0, start: 0, end: 0 })
  })

  it('失败后原页重试，包括修正页重新加载失败', () => {
    const pending = reduce(secondPage(), { type: 'page', page: 3 })
    const failed = reduce(pending, { type: 'failure', requestId: pending.requestId, error: '网络错误' })
    expect(failed).toMatchObject({ page: 3, loading: false, error: '网络错误', memories: [] })
    const retried = reduce(failed, { type: 'refresh' })
    expect(retried).toMatchObject({ page: 3, keyword: pending.keyword, loading: true, error: '' })
    const corrected = success(retried, 80, 0)
    const correctionFailed = reduce(corrected, { type: 'failure', requestId: corrected.requestId, error: '重载失败' })
    expect(reduce(correctionFailed, { type: 'refresh' })).toMatchObject({ page: 2, loading: true, error: '' })
  })

  it('同上下文下拉刷新与写入并发，写后刷新始终生效且丢弃写前读取', () => {
    const original = success(game(), 2)
    const reading = reduce(original, { type: 'refresh' })
    // 覆盖写前读取先返回、后返回两种顺序。
    for (const current of [reading, success(reading, 2)]) {
      const refreshed = reduce(current, { type: 'refresh', contextId: original.contextId })
      expect(refreshed.requestId).toBeGreaterThan(reading.requestId)
      expect(refreshed).toMatchObject({ contextId: original.contextId, loading: true })
      expect(reduce(refreshed, {
        type: 'success', requestId: reading.requestId, response: { memories: entries(2), total: 2 },
      })).toBe(refreshed)
      const settled = reduce(refreshed, {
        type: 'success', requestId: refreshed.requestId, response: { memories: [{ id: 2 }], total: 1 },
      })
      expect(settled).toMatchObject({ memories: [{ id: 2 }], total: 1, loading: false })
    }
  })

  it('重复相同搜索与翻页只改变读取代次，不阻止同上下文写后刷新', () => {
    const original = success(reduce(game(), { type: 'search', keyword: '银塔' }), 101)
    const repeat = success(reduce(original, { type: 'search', keyword: '  银塔  ' }), 101)
    const paged = reduce(repeat, { type: 'page', page: 2 })
    expect(paged.contextId).toBe(original.contextId)
    const refreshed = reduce(paged, { type: 'refresh', contextId: original.contextId })
    expect(refreshed).toMatchObject({ page: 2, keyword: '银塔', loading: true })
    expect(refreshed.requestId).toBeGreaterThan(paged.requestId)
  })

  it('切换对局/查询及切走再切回后，旧写入刷新与错误均不串上下文', () => {
    const original = secondPage()
    const searched = reduce(original, { type: 'search', keyword: '新查询' })
    const switched = reduce(original, { type: 'game', gameKey: 'other' })
    const candidates = [
      searched,
      switched,
      reduce(searched, { type: 'search', keyword: original.keyword }),
      reduce(switched, { type: 'game', gameKey: original.gameKey }),
    ]
    for (const current of candidates) {
      expect(current.contextId).toBeGreaterThan(original.contextId)
      expect(reduce(current, { type: 'refresh', contextId: original.contextId })).toBe(current)
      expect(reduce(current, {
        type: 'mutationFailure', contextId: original.contextId, error: '旧写入错误',
      })).toBe(current)
    }
  })

  it('同上下文读取期间的写入失败仍可展示，且不会提前结束读取', () => {
    const original = secondPage()
    const reading = reduce(original, { type: 'refresh' })
    const failed = reduce(reading, {
      type: 'mutationFailure', contextId: original.contextId, error: '删除失败',
    })
    expect(failed).toMatchObject({ error: '删除失败', loading: true, requestId: reading.requestId })
  })

  it('空搜索结果尊重服务端 total 0；部分页范围按实际条目计算', () => {
    expect(success(game(), 0, 2).memories).toEqual([])
    expect(memoryPageMeta(success(game(), 120, 3))).toMatchObject({ total: 120, start: 1, end: 3 })
    expect(memoryPageMeta(success(game(), 120, 0))).toMatchObject({ total: 120, start: 0, end: 0 })
  })

  it('接受 entries 别名，缺失/非法 total 仅回退至已知范围，不推测下一页', () => {
    for (const total of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const pending = reduce(secondPage(), { type: 'refresh' })
      const state = reduce(pending, { type: 'success', requestId: pending.requestId, response: { entries: entries(3, 50), total } })
      expect(state.total).toBe(53)
      expect(memoryPageMeta(state)).toMatchObject({ pages: 2, start: 51, end: 53 })
    }
  })

  it('缺失 total 的空后续页会回退重取；memories 空数组优先于 entries', () => {
    const pending = reduce(secondPage(), { type: 'refresh' })
    const corrected = reduce(pending, { type: 'success', requestId: pending.requestId, response: { memories: [] } })
    expect(corrected).toMatchObject({ page: 1, total: 50, loading: true })
    const settled = reduce(corrected, {
      type: 'success', requestId: corrected.requestId,
      response: { memories: [], entries: entries(3), total: 0 },
    })
    expect(settled).toMatchObject({ memories: [], total: 0, loading: false })
  })

  it('非法页码、越界、同页和加载中翻页均无效；没有对局不会保持加载状态', () => {
    const state = secondPage()
    for (const page of [0, -1, 4, 2, 1.5, Number.NaN]) {
      expect(reduce(state, { type: 'page', page })).toBe(state)
    }
    const pending = reduce(state, { type: 'refresh' })
    expect(reduce(pending, { type: 'page', page: 3 })).toBe(pending)
    expect(reduce(state, { type: 'game', gameKey: '' })).toMatchObject({ loading: false, page: 1, total: null, memories: [] })
  })
})
