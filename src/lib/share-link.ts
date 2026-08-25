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

  return {
    baseUrl: url.origin,
    game,
    user: q.get('user') ?? undefined,
    name: q.get('name') ?? undefined,
    delegate: q.get('delegate') ?? undefined,
  }
}

/**
 * 构建玩家邀请链接（对齐 Web buildJoinLink 的 play 路由分享格式）。
 * 用于 GM 从移动端生成邀请链接复制到剪贴板。
 */
export function buildShareLink(
  gameKey: string,
  publicBaseUrl?: string,
  userId?: string,
  _backendUrl?: string,
): string {
  const base = publicBaseUrl || ''
  const params = new URLSearchParams()
  params.set('game', gameKey)
  if (userId) {
    params.set('user', userId)
    params.set('share', '1')
  }
  const query = params.toString()
  return `${base}/#/play?${query}`
}
