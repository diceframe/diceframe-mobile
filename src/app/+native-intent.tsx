/**
 * 系统深链进入路由前的改写：加入页的邀请链接换成不会被路由层解码 / 按 `#` 切开的 link64
 * （见 lib/join-deep-link）。出错时原样放行，不让深链把 App 弄崩。
 */
import { rewriteJoinDeepLink } from '@/lib/join-deep-link'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return rewriteJoinDeepLink(path)
  } catch {
    return path
  }
}
