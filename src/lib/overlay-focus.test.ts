import { describe, expect, it } from 'vitest'

import { holdOverlay, overlayOpen } from './overlay-focus'

describe('浮层计数', () => {
  it('嵌套登记，全部释放后才算关闭；重复释放不会减成负数', () => {
    expect(overlayOpen()).toBe(false)
    const first = holdOverlay()
    const second = holdOverlay()
    first()
    first()
    expect(overlayOpen()).toBe(true)
    second()
    expect(overlayOpen()).toBe(false)
  })
})
