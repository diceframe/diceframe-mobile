import * as React from 'react'
import { BackHandler } from 'react-native'
import { router, type Href } from 'expo-router'

/**
 * 页头返回：有上一页就返回，没有就去该页的逻辑上级。
 *
 * 页面成为栈底的路径很多——冷启动深链接直达加入页、401 / 凭证失效 replace 到登录页或
 * 加入页、启动分流直接 replace 进对局——此时裸 `router.back()` 点了没有任何反应。
 *
 * 同时接管 Android 返回键：栈底页按返回键系统会直接退出 App，与页头箭头去上级不一致。
 * 只在按下那一刻栈里没有上一页时才拦截；栈里压着别的页时交还默认行为（弹出栈顶），
 * 所以下层页面挂着的同名监听不会抢走上层页面的返回。
 */
export function useBackNavigation(fallback: Href, { hardware = true }: { hardware?: boolean } = {}) {
  const fallbackRef = React.useRef(fallback)
  React.useEffect(() => {
    fallbackRef.current = fallback
  }, [fallback])

  React.useEffect(() => {
    // 本身就该是栈底的页面（未登录时的登录页）不接管：返回键在那里就该退出 App
    if (!hardware) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false
      router.replace(fallbackRef.current)
      return true
    })
    return () => subscription.remove()
  }, [hardware])

  return () => {
    if (router.canGoBack()) router.back()
    else router.replace(fallbackRef.current)
  }
}

/**
 * 去往一个新起点（连上服务器后的对局列表、401 后的登录页）：先弹掉栈里已失效的中间页
 * 再替换栈底，而不是在其上再叠一层——否则返回会退回登录页、加入页或旧服务器的设置页。
 */
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll()
  router.replace(href)
}

/**
 * 加入成功进对局：弹掉加入流程的中间页（加入页、从设置进来的身份页），保留栈底的
 * 「家」（对局列表，或玩家路径下的登录页），对局页返回时回到那里。
 */
export function enterFromFlow(href: Href) {
  if (router.canDismiss()) {
    router.dismissAll()
    router.push(href)
  } else {
    router.replace(href)
  }
}
