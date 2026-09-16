/**
 * 解析 Web 设置页出示的扫码登录载荷。
 *
 * 形如 `diceframe://pair?s=http%3A%2F%2F192.168.1.5%3A18000&c=K4M9QX27`，
 * 由主仓库 `frontend-v2/src/utils/shareLink.ts` 的 buildPairingPayload 生成。
 *
 * 用 App 私有 scheme 而不是 http 链接：这段内容只对本 App 有意义，编成 http
 * 只会把 GM 引到浏览器里去。配对码本身是一次性短时效凭据，出现在二维码里是
 * 设计的一部分——它换到的不是访问密码，而是一枚可单独吊销的设备令牌。
 */
import { normalizeBaseUrl } from '@/api/client'

export interface ParsedPairLink {
  baseUrl: string
  code: string
}

const PAIR_SCHEME_RE = /^diceframe:\/\/pair\b/i
/** 配对码字母表与长度跟随服务端 src/webui/pairing.py（去掉了易混字符） */
const PAIR_CODE_RE = /^[A-Z2-9]{6,16}$/

/** 手输兜底：把用户敲进来的配对码规范成服务端认识的形状 */
export function normalizePairCode(input: string): string {
  return String(input || '').trim().toUpperCase().replace(/[\s-]/g, '')
}

export function isPairCode(input: string): boolean {
  return PAIR_CODE_RE.test(normalizePairCode(input))
}

export function parsePairLink(input: string): ParsedPairLink | null {
  const raw = String(input || '').trim()
  if (!PAIR_SCHEME_RE.test(raw)) return null
  const queryIndex = raw.indexOf('?')
  if (queryIndex < 0) return null

  const params = new URLSearchParams(raw.slice(queryIndex + 1))
  const baseUrl = normalizeBaseUrl(params.get('s') ?? '')
  const code = normalizePairCode(params.get('c') ?? '')
  if (!baseUrl || !isPairCode(code)) return null
  return { baseUrl, code }
}
