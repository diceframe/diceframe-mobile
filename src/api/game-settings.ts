import { api, ApiError, errorCodeOf } from './client'
import { getT } from '@/i18n/t'
import { isLuckTimeoutSeconds, isNarrativePerspective, type NarrativePerspective } from '@/lib/game-settings'
import { UserFacingError } from '@/lib/user-facing-error'

interface SettingsResponse {
  ok?: boolean
  error?: string
  error_code?: string
  narrative_perspective?: unknown
  luck_timeout_seconds?: unknown
}

function assertSaved(result: SettingsResponse): void {
  if (result.ok === false || result.error) {
    throw new ApiError(result.error || getT()('settingFailed'), 200, errorCodeOf(result))
  }
}

/** 只提交视角字段，绝不经过 room-password 端点。 */
export async function setNarrativePerspective(
  gameKey: string,
  perspective: NarrativePerspective,
  signal?: AbortSignal,
): Promise<NarrativePerspective> {
  if (!gameKey.trim() || !isNarrativePerspective(perspective)) throw new UserFacingError('validationFailed')
  const result = await api<SettingsResponse>(`/games/${encodeURIComponent(gameKey)}/settings/narrative-perspective`, {
    method: 'POST',
    body: JSON.stringify({ perspective }),
    signal,
  })
  assertSaved(result)
  return isNarrativePerspective(result.narrative_perspective) ? result.narrative_perspective : perspective
}

/** 秒数在 UI 与 API 边界都校验，防止 Python int() 静默截断小数。 */
export async function setLuckTimeout(
  gameKey: string,
  seconds: number,
  signal?: AbortSignal,
): Promise<number> {
  if (!gameKey.trim() || !isLuckTimeoutSeconds(seconds)) throw new UserFacingError('validationFailed')
  const result = await api<SettingsResponse>(`/games/${encodeURIComponent(gameKey)}/settings/luck-timeout`, {
    method: 'POST',
    body: JSON.stringify({ seconds }),
    signal,
  })
  assertSaved(result)
  return isLuckTimeoutSeconds(result.luck_timeout_seconds) ? result.luck_timeout_seconds : seconds
}
