/**
 * 本应用自己打开的原生浮层（RN Modal）计数。
 *
 * Android 上 Modal 是独立窗口：打开时主窗口失去焦点，AppState 会发 `blur`。对局生命周期
 * 为了兜住「锁屏只通知焦点变化」的机型把 blur 当成暂停，结果打开任何底部面板都会断开实时
 * 连接、关闭时再重连并整页刷新（实机现象：面板一开状态就变「连接中」）。浮层打开期间的 blur
 * 是自己造成的，应忽略；真正切到后台仍由 AppState `background` 暂停，不受影响。
 */
import * as React from 'react'

let openCount = 0

/** 登记一个打开中的浮层，返回释放函数（重复调用安全）。 */
export function holdOverlay(): () => void {
  openCount += 1
  let released = false
  return () => {
    if (released) return
    released = true
    openCount = Math.max(0, openCount - 1)
  }
}

export function overlayOpen(): boolean {
  return openCount > 0
}

/** 浮层可见期间登记；effect 先于原生窗口焦点事件到达 JS，打开瞬间的 blur 能被识别。 */
export function useOverlayHold(active: boolean): void {
  React.useEffect(() => {
    if (!active) return
    return holdOverlay()
  }, [active])
}
