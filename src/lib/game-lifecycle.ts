type AppVisibility = 'active' | 'inactive' | 'background' | 'unknown' | 'extension'

/** 权限弹窗等会短暂进入 inactive；只有真正进入后台才暂停对局连接。 */
export function gameLifecycleAction(
  previous: AppVisibility,
  next: AppVisibility,
): 'pause' | 'resume' | null {
  if (next === 'background' && previous !== 'background') return 'pause'
  // iOS 从后台回来会先经过 inactive，resume 由 store 的 suspended 标记保证幂等。
  if (next === 'active' && previous !== 'active') return 'resume'
  return null
}
