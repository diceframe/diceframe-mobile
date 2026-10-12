/**
 * 分享链接玩家的席位凭证与房间令牌（纯逻辑；store 持久化见 stores/settings.ts，
 * 请求注入见 api/client.ts）。对齐主仓库 frontend-v2/src/utils/seatToken.ts。
 *
 * 服务端契约（src/webui/access_control.py）：
 * - 服务端配置了访问密码时，非 Owner 的分享请求只凭 `X-Seat-Token` 认席位，
 *   `?user=` 不再证明身份；缺失 401 SEAT_TOKEN_REQUIRED，失效 401 SEAT_TOKEN_INVALID。
 * - 房间密码换到的 room token 只认 `X-Room-Token` 请求头（query 会落进访问日志）。
 *
 * 两种凭证都按「后端地址 + gameKey」分槽保存：移动端会连多台服务器，
 * 一条指向别的服务器的伪造邀请链接绝不能拿到本服务器签发的凭证。
 * 凭证明文只在本模块的槽位里流转，不进 ShareIdentity / 界面状态 / 日志。
 */

export const SEAT_TOKEN_HEADER = 'X-Seat-Token'
export const ROOM_TOKEN_HEADER = 'X-Room-Token'

export interface ShareCredential {
  /** 席位凭证：新建席位时 POST /players 返回一次、GM 接管链接 `seat=`、或 claim 换得 */
  seat?: string
  /** 房间令牌：POST verify-room-password 换得（默认 30 天有效，改密即吊销） */
  room?: string
}

/** 键 = credentialKey(baseUrl, gameKey) */
export type CredentialSlots = Record<string, ShareCredential>

/**
 * 槽位键：gameKey + 已规范化的后端地址（调用方先 normalizeBaseUrl）。
 * 任一为空返回空串，读写都按「无凭证」处理，避免把凭证挂到不确定的服务器上。
 */
export function credentialKey(baseUrl: string, gameKey: string): string {
  if (!baseUrl || !gameKey) return ''
  return `${gameKey}@${encodeURIComponent(baseUrl)}`
}

export function readCredential(slots: CredentialSlots | undefined, baseUrl: string, gameKey: string): ShareCredential {
  const key = credentialKey(baseUrl, gameKey)
  return (key && slots?.[key]) || {}
}

function cleanToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function patchCredential(
  slots: CredentialSlots,
  baseUrl: string,
  gameKey: string,
  patch: Partial<Record<keyof ShareCredential, string | null>>,
): CredentialSlots {
  const key = credentialKey(baseUrl, gameKey)
  if (!key) return slots
  const previous = slots[key]
  const next: ShareCredential = { ...previous }
  for (const [field, value] of Object.entries(patch) as [keyof ShareCredential, string | null][]) {
    if (value) next[field] = value
    else delete next[field]
  }
  // 没变化时返回原引用，store 据此跳过无谓的持久化写入
  if (next.seat === previous?.seat && next.room === previous?.room) return slots
  const out = { ...slots }
  if (next.seat || next.room) out[key] = next
  else delete out[key]
  return out
}

/** 写入席位凭证；空值忽略（服务端没下发时不覆盖已有凭证） */
export function withSeatToken(slots: CredentialSlots, baseUrl: string, gameKey: string, token: unknown): CredentialSlots {
  const value = cleanToken(token)
  return value ? patchCredential(slots, baseUrl, gameKey, { seat: value }) : slots
}

export function withRoomToken(slots: CredentialSlots, baseUrl: string, gameKey: string, token: unknown): CredentialSlots {
  const value = cleanToken(token)
  return value ? patchCredential(slots, baseUrl, gameKey, { room: value }) : slots
}

export function withoutSeatToken(slots: CredentialSlots, baseUrl: string, gameKey: string): CredentialSlots {
  return patchCredential(slots, baseUrl, gameKey, { seat: null })
}

export function withoutRoomToken(slots: CredentialSlots, baseUrl: string, gameKey: string): CredentialSlots {
  return patchCredential(slots, baseUrl, gameKey, { room: null })
}

/** API 路径 `/games/<key>/...` 中的 gameKey（已解码）；不是对局路径返回空串 */
export function gameKeyOfApiPath(path: string): string {
  const match = /^\/?games\/([^/?#]+)/u.exec(path)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

/** delegate=1/true/yes：Owner 代 P2P 访客发言，席位由 query 指明，不带席位凭证 */
export function isDelegateFlag(value: string | undefined | null): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

/**
 * 领取首枚席位凭证（POST seat-token/claim）失败是否意味着「本设备回不去这个席位了」：
 * - SEAT_TOKEN_EXISTS：席位已有凭证（在别的设备上），会话不能再代表它；
 * - SEAT_NOT_BOUND：本会话没有绑定该局席位；
 * - GM_SEAT_REQUIRES_OWNER：会话绑在 GM 席位上，玩家链接不能接管 GM。
 * 这些情况只能靠 GM 的接管链接回来。其余失败（断网、限流、旧服务端没有该端点）
 * 不下结论：继续按 `?user=` 回退，旧服务端与无访问密码的服务端仍认它。
 */
export function isFinalClaimFailure(error: { status?: number; code?: string } | null | undefined): boolean {
  const code = error?.code ?? ''
  return code === 'SEAT_TOKEN_EXISTS' || code === 'SEAT_NOT_BOUND' || code === 'GM_SEAT_REQUIRES_OWNER'
}

/** 加入页提示：凭证被拒/缺失后由路由层带过来的 notice 参数 */
export type JoinNotice = 'seat' | 'seat-invalid' | 'room'

export function parseJoinNotice(value: unknown): JoinNotice | null {
  return value === 'seat' || value === 'seat-invalid' || value === 'room' ? value : null
}

/**
 * GM 出示某个席位的接管链接时取凭证（对齐 Web PlayView copyLink）：
 * 先不轮换地签发（cached = 本次会话已拿到的旧链接凭证，仍有效则原样返回）；
 * 席位正被设备使用（409 SEAT_TOKEN_EXISTS）时重新生成会让那些设备下线，
 * 必须经 GM 明确确认才 rotate。返回 null = GM 取消。其余错误原样抛出。
 */
export async function resolveTakeoverToken(
  cached: string,
  deps: {
    issue: (options: { rotate: boolean; check?: string }) => Promise<string>
    /** stale = 本机缓存的旧链接已被别处重新生成 */
    confirmRotate: (stale: boolean) => Promise<boolean>
  },
): Promise<string | null> {
  try {
    return await deps.issue(cached ? { rotate: false, check: cached } : { rotate: false })
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== 'SEAT_TOKEN_EXISTS') throw error
  }
  if (!(await deps.confirmRotate(!!cached))) return null
  return deps.issue({ rotate: true })
}
