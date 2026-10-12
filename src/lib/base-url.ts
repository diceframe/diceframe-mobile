/**
 * 服务器地址的唯一规范化入口。
 *
 * 当前连接、历史列表、原生会话映射、分享凭证槽位（seat-credentials 的 credentialKey）
 * 与邀请链接解析/生成共用这一份结果：同一台服务器只能有一种拼写，否则凭证会被存到
 * 一个键下、却按另一个键去读（或者更糟——两台不同的服务器撞到同一个键）。
 *
 * 规则（越严越好，宁可不认也不混淆）：
 * - 只接受 http / https；没写协议按 http 补全，写了别的协议一律视为无效（返回空串）；
 * - scheme、host 小写，默认端口省略（交给 URL 规范化）；
 * - 去掉地址栏凭据（user:pass@）、query 与 hash——它们不是服务器身份的一部分；
 * - 保留路径前缀（反向代理子路径），只去尾部斜杠；路径大小写敏感，不同前缀是不同服务器。
 */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

export function normalizeBaseUrl(input: string | null | undefined): string {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  const candidate = SCHEME_RE.test(raw) ? raw : `http://${raw}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return ''
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return ''
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** 两个地址是否指向同一台服务器（规范化后完全相等；任一无效即不相等） */
export function isSameBackend(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeBaseUrl(a)
  return !!left && left === normalizeBaseUrl(b)
}

