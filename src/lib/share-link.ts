/**
 * 解析 Web 端生成的玩家分享链接。
 * 形如 `http://192.168.1.5:18000/#/join?game=KEY&share=1`，
 * 参数可能出现在 hash（Web hash 路由）或 search（直链）里。
 *
 * GM 接管链接在 hash 路由里带该席位的凭证：`#/join?game=KEY&share=1&seat=<token>`
 * （对齐主仓库 frontend-v2/src/utils/shareLink.ts 的 buildJoinLink）。凭证是秘密：
 * 解析结果里的 seat 只交给 settings 的凭证槽位，界面状态与日志一律用 redactShareLink
 * 处理过的链接。只带公开 uid（`user=`）而没有 seat 的旧接管链接已经不能证明身份，
 * 解析为 legacyUser，由加入页提示「链接已失效，请向 GM 重新获取」。
 */
export interface ParsedShareLink {
  baseUrl: string
  game: string
  name?: string
  delegate?: string
  server?: string
  /** 席位凭证（GM 接管链接）；只用于写入凭证槽位，不得进入界面状态 */
  seat?: string
  /** 旧版只带公开 uid 的接管链接（无 seat）：新服务端不再认它 */
  legacyUser?: string
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
  const seat = q.get('seat')?.trim() || undefined
  const legacyUser = !seat ? q.get('user')?.trim() || undefined : undefined

  return {
    // Standalone Web links carry the actual API origin separately from the
    // public frontend origin. Mobile must connect to that backend directly.
    baseUrl: server
      ? normalizePublicBaseUrl(server)
      : normalizePublicBaseUrl(`${url.origin}${url.pathname}`),
    game,
    name: q.get('name') ?? undefined,
    delegate: q.get('delegate') ?? undefined,
    ...(server ? { server: normalizePublicBaseUrl(server) } : {}),
    ...(seat ? { seat } : {}),
    ...(legacyUser ? { legacyUser } : {}),
  }
}

/**
 * 从链接文本里抹掉席位凭证（seat=…），用于回填输入框等可见状态。
 * 不解析 URL：用户粘贴的可能是半截或夹带空白的文本，按参数边界逐个剔除最稳妥。
 */
export function redactShareLink(input: string): string {
  return input
    .replace(/([?&])seat=[^&#\s]*(&?)/gi, (_match, separator: string, tail: string) => (tail ? separator : ''))
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
 * seatToken 只用于 GM 出示的接管链接（POST players/{uid}/seat-token 签发），
 * 普通邀请链接不带。
 */
export function buildShareLink(
  gameKey: string,
  publicBaseUrl?: string,
  seatToken?: string,
  backendUrl?: string,
): string {
  const base = normalizePublicBaseUrl(publicBaseUrl || backendUrl)
  const url = new URL(`${base}/`)
  const params = new URLSearchParams({ game: gameKey, share: '1' })
  if (seatToken) params.set('seat', seatToken)
  if (backendUrl) params.set('server', normalizePublicBaseUrl(backendUrl))
  url.hash = `/join?${params.toString()}`
  return url.toString()
}
