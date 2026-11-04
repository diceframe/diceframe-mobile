import { describe, expect, it } from 'vitest'

import { tabBarContentInset } from './tab-bar-overlap'

describe('tabBarContentInset', () => {
  it('胶囊悬浮时在原有留白上加上被盖住的高度', () => {
    expect(tabBarContentInset(100, 32)).toEqual({ paddingBottom: 132 })
  })

  it('没有悬浮胶囊（贴底、经典风格、二级页）时不改样式，沿用列表自己的留白', () => {
    expect(tabBarContentInset(0, 32)).toBeUndefined()
  })
})
