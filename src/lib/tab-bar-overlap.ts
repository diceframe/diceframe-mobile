import * as React from 'react'

/**
 * 悬浮胶囊标签栏盖住的底部高度。由标签导航（(tabs)/_layout）提供，只有标签页内拿得到；
 * 从根 Stack 推上来的二级页不在标签导航里，取到 0。
 */
export const TabBarOverlapContext = React.createContext(0)

export function useTabBarOverlap(): number {
  return React.useContext(TabBarOverlapContext)
}

/**
 * 标签页滚动容器的底部留白：胶囊悬浮时在原有留白上加上被盖住的高度，否则不改样式
 * （返回 undefined，沿用各列表自己的 pb-* 类）。
 */
export function tabBarContentInset(overlap: number, base: number): { paddingBottom: number } | undefined {
  return overlap > 0 ? { paddingBottom: base + overlap } : undefined
}
