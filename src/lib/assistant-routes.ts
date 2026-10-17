/**
 * Agent 的 navigate 页面名 → 移动端路由。上游页面名是 Web 的哈希路由；移动端没有对应页面的
 * （creator / map / library / adventures / modules）返回 null，界面提示去 Web 端打开。
 */
import type { AssistantNavigation } from './assistant-agent'

const STATIC_ROUTES: Record<string, string> = {
  overview: '/overview',
  create: '/create',
  characters: '/characters',
  lorebook: '/lorebook',
  worlds: '/worlds',
  memory: '/memory',
  logs: '/logs',
  rules: '/rules',
  plugins: '/plugins',
  settings: '/settings',
}

export function mobileRouteOf(navigation: AssistantNavigation): string | null {
  if (navigation.route === 'play') {
    const game = navigation.query?.game?.trim()
    return game ? `/play/${encodeURIComponent(game)}` : '/overview'
  }
  return STATIC_ROUTES[navigation.route] ?? null
}
