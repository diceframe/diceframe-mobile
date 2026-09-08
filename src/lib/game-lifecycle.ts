type AppVisibility = 'active' | 'inactive' | 'background' | 'unknown' | 'extension'

/** 权限弹窗等会短暂进入 inactive；只有真正进入后台才暂停对局连接。 */
export function gameLifecycleAction(
  previous: AppVisibility,
  next: AppVisibility,
): 'pause' | 'resume' | null {
  if (next === 'background' && previous !== 'background') return 'pause'
  // iOS 解锁也可能只有 inactive → active；回前台就重建可能失效的连接。
  if (next === 'active' && previous !== 'active') return 'resume'
  return null
}

/** 合并可见性与焦点通知，避免同一次解锁连续触发两次恢复。 */
export function createGameLifecycle(
  initialState: AppVisibility,
  handlers: { pause: () => void; resume: () => void },
) {
  let state = initialState
  let blurred = false
  if (state === 'background') handlers.pause()

  return {
    change(next: AppVisibility) {
      const action = gameLifecycleAction(state, next)
      state = next
      if (action === 'resume') blurred = false
      if (action) handlers[action]()
    },
    blur() {
      if (blurred) return
      blurred = true
      handlers.pause()
    },
    focus() {
      if (!blurred || state !== 'active') return
      blurred = false
      handlers.resume()
    },
  }
}
