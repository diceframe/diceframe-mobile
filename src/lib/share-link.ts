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
 *
 * 后端地址一律经 lib/base-url 的 normalizeBaseUrl 规范化：与当前连接、凭证槽位同一拼写。
 */
import { isSameBackend, normalizeBaseUrl } from '@/lib/base-url'

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

  // Standalone Web links carry the actual API origin separately from the
  // public frontend origin. Mobile must connect to that backend directly.
  const baseUrl = normalizeBaseUrl(server ?? `${url.origin}${url.pathname}`)
  // 后端地址不是可识别的 http(s) 服务器：宁可拒绝，也不拼出一个奇怪的凭证键
  if (!baseUrl) return null

  return {
    baseUrl,
    game,
    name: q.get('name') ?? undefined,
    delegate: q.get('delegate') ?? undefined,
    ...(server ? { server: baseUrl } : {}),
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

/**
 * 点「解析链接」时实际解析哪条链接：输入框只回显剥掉 seat= 的链接（凭证不留在可见状态），
 * 深链带来的接管链接因此在输入框里没有席位凭证。输入框仍是那条深链的预填内容时，用原始链接
 * 解析，席位凭证才不会在这一步丢掉；用户改过输入框就以输入框为准。
 */
export function linkToParse(fieldText: string, incomingLink: string): string {
  if (incomingLink && fieldText.trim() === redactShareLink(incomingLink).trim()) return incomingLink
  return fieldText
}

/**
 * 深链（`diceframe://join?link=…`）能否不经确认自动解析：任何网页都能拉起这个路由，
 * 自动解析一条指向别的服务器的链接会登出房主、清掉身份并把 App 指向对方服务器
 * （随后的假登录页可钓访问密码）。所以只放行：
 * - 链接后端与当前连接是同一台服务器（凭证被拒后路由层的内部回跳正是这种）；
 * - 且不带 seat=（席位凭证只该经用户明确操作写入）。
 */
export function joinLinkAutoParseAllowed(link: string, currentBaseUrl: string): boolean {
  const parsed = parseShareLink(link)
  return !!parsed && !parsed.seat && isSameBackend(parsed.baseUrl, currentBaseUrl)
}

/**
 * 解析这条链接会把 App 切到另一台服务器时，返回规范化后的目标地址（供确认框展示）；
 * 同一台服务器、尚未连接任何服务器（没有可丢失的登录态）或链接无效时返回 null。
 */
export function serverSwitchTarget(link: string, currentBaseUrl: string): string | null {
  const parsed = parseShareLink(link)
  const current = normalizeBaseUrl(currentBaseUrl)
  if (!parsed || !current || parsed.baseUrl === current) return null
  return parsed.baseUrl
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
  const base = normalizeBaseUrl(publicBaseUrl || backendUrl) || 'http://localhost'
  const url = new URL(`${base}/`)
  const params = new URLSearchParams({ game: gameKey, share: '1' })
  if (seatToken) params.set('seat', seatToken)
  const server = normalizeBaseUrl(backendUrl)
  if (server) params.set('server', server)
  url.hash = `/join?${params.toString()}`
  return url.toString()
}
