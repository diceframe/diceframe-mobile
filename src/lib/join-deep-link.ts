/**
 * 邀请链接经路由参数传给加入页时的编码。
 *
 * 邀请链接本身带 `#/join?game=…&share=1` 片段。经深链（`diceframe://join?link=<编码后的链接>`）
 * 进来时，路由层解析路径会把 `%23` 还原成 `#` 再当作片段切掉，加入页只拿到
 * `http://host/` 。所以在系统路径进入路由之前（+native-intent）把 link 换成 base64url
 * 的 `link64`：只含 `[A-Za-z0-9_-]`，不会被任何一层解码或按 `#` / `&` 切开。
 * App 内跳回加入页（凭证被拒、席位失效）也用同一编码。
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function utf8Bytes(text: string): number[] {
  const bytes: number[] = []
  const encoded = encodeURIComponent(text)
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(encoded.charCodeAt(index))
    }
  }
  return bytes
}

export function encodeJoinLink(link: string): string {
  const bytes = utf8Bytes(link)
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const [a, b, c] = [bytes[index], bytes[index + 1], bytes[index + 2]]
    const chunk = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(chunk >> 18) & 63] + ALPHABET[(chunk >> 12) & 63]
    if (b !== undefined) out += ALPHABET[(chunk >> 6) & 63]
    if (c !== undefined) out += ALPHABET[chunk & 63]
  }
  return out
}

/** 解码失败（被截断、被改过）返回空串，加入页按没有链接处理 */
export function decodeJoinLink(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return ''
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 4) {
    const group = value.slice(index, index + 4)
    if (group.length === 1) return ''
    let chunk = 0
    for (let offset = 0; offset < 4; offset += 1) chunk = (chunk << 6) | (offset < group.length ? ALPHABET.indexOf(group[offset]) : 0)
    bytes.push((chunk >> 16) & 255)
    if (group.length > 2) bytes.push((chunk >> 8) & 255)
    if (group.length > 3) bytes.push(chunk & 255)
  }
  try {
    return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''))
  } catch {
    return ''
  }
}

/** 加入页的路由参数：邀请链接走 link64 */
export function joinLinkParams(link: string): { link64: string } {
  return { link64: encodeJoinLink(link) }
}

/** 加入页读邀请链接：优先 link64，兼容直接给的 link */
export function joinLinkFromParams(params: { link?: string; link64?: string }): string {
  if (params.link64) return decodeJoinLink(params.link64)
  return params.link ?? ''
}

/**
 * 系统深链 → 路由路径（+native-intent 的 redirectSystemPath 调用）。只处理加入页的 link 参数：
 * - `link` 已整体编码（推荐写法，`#` 为 `%23`）：解一次码；
 * - `link` 未编码（`link=http://h/#/join?game=x&share=1`）：取 `link=` 之后到末尾的全部内容，
 *   其中的 `&` 属于邀请链接自己（这种写法下加入页的其他参数只有放在 link 之前才认）。
 * 其余路径原样返回。
 */
export function rewriteJoinDeepLink(path: string): string {
  const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/')
  const match = /^\/+(?:\(auth\)\/)?join(?:\/)?\?(.*)$/s.exec(withoutScheme)
  if (!match) return path
  const query = match[1]
  const at = query.search(/(^|&)link=/)
  if (at < 0) return path
  const start = query.indexOf('link=', at) + 'link='.length
  const raw = query.slice(start)
  const before = query.slice(0, at)
  let link = raw
  let after = ''
  if (!raw.includes('://')) {
    const [value, ...others] = raw.split('&')
    after = others.join('&')
    try {
      link = decodeURIComponent(value)
    } catch {
      return path
    }
  }
  const rest = new URLSearchParams([before, after].filter(Boolean).join('&'))
  rest.delete('link')
  rest.delete('link64')
  rest.set('link64', encodeJoinLink(link))
  return `/join?${rest.toString()}`
}
