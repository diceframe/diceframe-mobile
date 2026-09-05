import { create } from 'zustand'

import { errorMessage } from '@/api/client'
import type { AppUpdateInfo } from '@/lib/updates'

const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FAILED_CHECK_RETRY_MS = 15 * 60 * 1000

interface AppUpdatesState {
  checking: boolean
  result: AppUpdateInfo | null
  error: string | null
  /** 自动检查遵守冷却时间，手动检查可立即重试；并发调用共用同一次请求。 */
  check: (options?: { automatic?: boolean }) => Promise<AppUpdateInfo | null>
}

/** 注入加载器，让检查调度与状态推导不依赖原生模块，也便于验证并发和失败恢复。 */
export function createAppUpdatesStore(loadLatest: () => Promise<AppUpdateInfo>) {
  let pending: Promise<AppUpdateInfo | null> | null = null
  let nextAutomaticCheckAt = 0

  return create<AppUpdatesState>((set, get) => ({
    checking: false,
    result: null,
    error: null,
    check(options) {
      if (pending) return pending
      if (options?.automatic && Date.now() < nextAutomaticCheckAt) {
        return Promise.resolve(get().result)
      }

      // 将加载推迟到微任务，确保订阅者触发的并发检查也能复用 pending。
      pending = Promise.resolve()
        .then(loadLatest)
        .then((result) => {
          nextAutomaticCheckAt = Date.now() + AUTO_CHECK_INTERVAL_MS
          set({ result, error: null })
          return result
        })
        .catch((error: unknown) => {
          nextAutomaticCheckAt = Date.now() + FAILED_CHECK_RETRY_MS
          // 网络失败保留已知新版，避免首页红点因临时断网消失。
          set({ error: errorMessage(error, 'dfUpdatesCheckFailed') })
          return null
        })
        .finally(() => {
          pending = null
          set({ checking: false })
        })
      set({ checking: true, error: null })
      return pending
    },
  }))
}
