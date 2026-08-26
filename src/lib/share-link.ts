/**
 * 解析 Web 端生成的玩家分享链接。
 * 形如 `http://192.168.1.5:18000/#/play?game=KEY&user=UID&share=1&name=NAME`，
 * 参数可能出现在 hash（Web hash 路由）或 search（直链）里。
 */
export interface ParsedShareLink {
  baseUrl: string
  game: string
  user?: string
  name?: string
  delegate?: string
  server?: string
}

export function parseShareLink(input: string): ParsedShareLink | null {
  const raw = input.trim()
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!url.hostname) return null

  const query = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : url.search
  const q = new URLSearchParams(query)
  const game = q.get('game')
  if (!game) return null
  const server = q.get('server') || undefined

  return {
    // Standalone Web links carry the actual API origin separately from the
    // public frontend origin. Mobile must connect to that backend directly.
    baseUrl: server ? normalizePublicBaseUrl(server) : url.origin,
    game,
    user: q.get('user') ?? undefined,
    name: q.get('name') ?? undefined,
    delegate: q.get('delegate') ?? undefined,
    ...(server ? { server: normalizePublicBaseUrl(server) } : {}),
  }
}

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

function normalizePublicBaseUrl(value?: string, fallback = 'http://localhost'): string {
  const raw = String(value || fallback).trim()
  const candidate = URL_SCHEME_RE.test(raw) ? raw : `http://${raw}`
  try {
    const parsed = new URL(candidate)
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${path}`
  } catch {
    return fallback
  }
}

/**
 * 构建玩家邀请链接（与 Web buildJoinLink 保持同一 canonical 路由和参数）。
 * 移动端必须传入实际可访问的 publicBaseUrl（通常来自服务器配置或当前连接地址）。
 */
export function buildShareLink(
  gameKey: string,
  publicBaseUrl?: string,
  userId?: string,
  backendUrl?: string,
): string {
  const base = normalizePublicBaseUrl(publicBaseUrl || backendUrl)
  const url = new URL(`${base}/`)
  const params = new URLSearchParams({ game: gameKey, share: '1' })
  if (userId) params.set('user', userId)
  if (backendUrl) params.set('server', normalizePublicBaseUrl(backendUrl))
  url.hash = `/join?${params.toString()}`
  return url.toString()
}
