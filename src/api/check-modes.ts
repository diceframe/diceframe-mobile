import { api, ApiError, errorCodeOf } from './client'
import { getT } from '@/i18n/t'
import {
  parseCheckModeState,
  type CheckModeOperation,
  type CheckModeRequestBody,
  type CheckModeState,
} from '@/lib/check-modes'

function basePath(gameKey: string): string {
  return `/games/${encodeURIComponent(gameKey)}/check-modes`
}

function parsed(raw: unknown): CheckModeState {
  const state = parseCheckModeState(raw)
  if (state) return state
  const result = (raw ?? {}) as { error?: string; error_code?: string; code?: string }
  throw new ApiError(result.error || getT()('dfModeError'), 200, errorCodeOf(result))
}

/** GM 或已入座玩家可读；旧服务端没有该端点时 404，由调用方隐藏入口。 */
export async function fetchCheckModes(gameKey: string, signal?: AbortSignal): Promise<CheckModeState> {
  return parsed(await api<unknown>(basePath(gameKey), { signal }))
}

export async function mutateCheckMode(
  gameKey: string,
  uid: string,
  operation: CheckModeOperation,
  body: CheckModeRequestBody,
): Promise<CheckModeState> {
  return parsed(await api<unknown>(`${basePath(gameKey)}/seats/${encodeURIComponent(uid)}/${operation}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }))
}
