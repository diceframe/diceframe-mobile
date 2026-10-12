/**
 * 跳回加入页的去重：凭证被拒时，同一时刻在途的几个请求（行动、刷新、地图…）会各自收到
 * 401 / 403，各触发一次跳转，加入页因此被连续挂载几次、每次都重新解析邀请链接
 * （设备日志里同一秒三次 /config + 三次详情）。同一局同一原因在短时间内只跳一次。
 */
const WINDOW_MS = 3000

export function createJoinBounceGuard(now: () => number = Date.now) {
  let last: { key: string; at: number } | null = null
  return (key: string): boolean => {
    const at = now()
    if (last && last.key === key && at - last.at < WINDOW_MS) return false
    last = { key, at }
    return true
  }
}

/** App 共用的一个实例（_layout 的凭证被拒回调与对局页的身份失效判定） */
export const shouldBounceToJoin = createJoinBounceGuard()
