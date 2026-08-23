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
