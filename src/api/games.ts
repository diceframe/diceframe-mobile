/**
 * 游戏域 API（路径与 payload 对齐 Web 端 PlayView/JoinView/useGame 的调用方式）。
 */
import type {
  ActionSubmitResponse,
  CharacterListResponse,
  CharacterSheet,
  CommandResponse,
  GameDetail,
  GameLogResponse,
  GamesResponse,
  JsonObject,
  LuckDecisionResponse,
  MapData,
  PlayerCreateResponse,
  PlayerContextResponse,
  PrivateLogResponse,
} from './types'

import { api } from './client'

function gamePath(gameKey: string, suffix = ''): string {
  return `/games/${encodeURIComponent(gameKey)}${suffix}`
}

export function fetchGames(): Promise<GamesResponse> {
  return api<GamesResponse>('/games')
}

export function fetchGameDetail(gameKey: string): Promise<GameDetail> {
  return api<GameDetail>(gamePath(gameKey))
}

export function fetchCharacters(gameKey: string): Promise<CharacterListResponse> {
  return api<CharacterListResponse>(gamePath(gameKey, '/characters'))
}

export function fetchLog(gameKey: string, page?: number): Promise<GameLogResponse> {
  const suffix = typeof page === 'number' ? `/log?page=${page}` : '/log'
  return api<GameLogResponse>(gamePath(gameKey, suffix))
}

export function fetchPrivateLog(gameKey: string): Promise<PrivateLogResponse> {
  return api<PrivateLogResponse>(gamePath(gameKey, '/private-log'))
}

export function fetchMap(gameKey: string): Promise<MapData> {
  return api<MapData>(gamePath(gameKey, '/map'))
}

export async function fetchPlayerContext(gameKey: string): Promise<PlayerContextResponse> {
  try {
    return await api<PlayerContextResponse>(gamePath(gameKey, '/player-context'))
  } catch {
    return { preview: false }
  }
}

export function submitAction(gameKey: string, text: string): Promise<ActionSubmitResponse> {
  return api<ActionSubmitResponse>(gamePath(gameKey, '/action'), {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function advanceGame(gameKey: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/advance'), {
    method: 'POST',
    body: JSON.stringify({ force: true }),
  })
}

export function rollbackGame(gameKey: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/rollback'), { method: 'POST', body: '{}' })
}

export function gmCommand(gameKey: string, command: string): Promise<CommandResponse> {
  return api<CommandResponse>(gamePath(gameKey, '/gm-command'), {
    method: 'POST',
    body: JSON.stringify({ command }),
  })
}

export function resolveLuck(
  gameKey: string,
  checkId: string,
  spend: boolean,
): Promise<LuckDecisionResponse> {
  return api<LuckDecisionResponse>(gamePath(gameKey, `/checks/${encodeURIComponent(checkId)}/luck`), {
    method: 'POST',
    body: JSON.stringify({ spend }),
  })
}

/** POST /players：join_as_new=false 找回既有身份；true 以 sheet 新建 */
export function joinGame(
  gameKey: string,
  payload: { user_id: string; join_as_new: false } | ({ join_as_new: true } & Partial<CharacterSheet> & JsonObject),
): Promise<PlayerCreateResponse> {
  return api<PlayerCreateResponse>(gamePath(gameKey, '/players'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function verifyRoomPassword(gameKey: string, password: string): Promise<string> {
  const result = await api<{ room_token?: string }>(gamePath(gameKey, '/verify-room-password'), {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  if (!result.room_token) throw new Error('房间密码校验未返回令牌')
  return result.room_token
}

/**
 * 把当前会话绑定为存档的 GM 身份（换设备登录 Owner 后恢复房主身份，
 * 对齐 Web loadPlayContext 无 user 参数时的 claim-gm 调用）。
 */
export async function claimGm(gameKey: string): Promise<string | null> {
  const result = await api<{ ok?: boolean; user_id?: string }>(gamePath(gameKey, '/claim-gm'), {
    method: 'POST',
    body: '{}',
  })
  return result.user_id ?? null
}

/** SSE 一次性票据（30s TTL）；票据请求本身走鉴权（Bearer 或分享参数） */
export async function requestSseTicket(gameKey: string): Promise<string> {
  const result = await api<{ ticket?: string }>(gamePath(gameKey, '/sse-ticket'), {
    method: 'POST',
  })
  if (!result.ticket) throw new Error('未能获取实时流票据')
  return result.ticket
}
