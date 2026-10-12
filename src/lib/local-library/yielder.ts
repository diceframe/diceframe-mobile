/**
 * 按时间预算让出 JS 线程：连续处理多项（读列表、M5/M6 逐项写入）时，只有本轮已占用
 * 超过预算（默认约 8ms，半帧）才让出一次，既不卡界面，也不在每项之后都付一次调度开销。
 */
export function createYielder(
  budgetMs = 8,
  now: () => number = () => Date.now(),
  yieldOnce: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): () => Promise<void> {
  let sliceStart = now()
  return async () => {
    if (now() - sliceStart < budgetMs) return
    await yieldOnce()
    sliceStart = now()
  }
}

/**
 * 只认最后一次发起的加载：并发的 load() 里先发后到的结果直接丢弃，界面不会被旧列表覆盖。
 */
export function createLatestGuard(): { begin: () => () => boolean } {
  let latest = 0
  return {
    begin() {
      const ticket = ++latest
      return () => ticket === latest
    },
  }
}
