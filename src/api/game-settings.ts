import { api, ApiError, errorCodeOf } from './client'
import { getT } from '@/i18n/t'
import {
  isLuckTimeoutSeconds,
  isNarrativePerspective,
  parseSessionPreferences,
  type NarrativePerspective,
  type SessionPreferencesPatch,
  type SessionPreferencesState,
} from '@/lib/game-settings'
import { AWAY_CONTROL_POLICIES, type AwayControlPolicy } from '@/lib/player-control'
import { UserFacingError } from '@/lib/user-facing-error'

interface SettingsResponse {
  ok?: boolean
  error?: string
  error_code?: string
  narrative_perspective?: unknown
  luck_timeout_seconds?: unknown
  away_control_policy?: unknown
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

/**
 * 房间暂离语义：pause（角色留在原地）/ ai_takeover（交给 AI 临时托管）。
 * 与视角、幸运超时一样只提交自己这一个字段——房间密码有独立端点，
 * 绝不能被"顺手一起保存"清空（上游 Web 的同一个弹窗就踩过这个坑）。
 */
export async function setAwayControlPolicy(
  gameKey: string,
  policy: AwayControlPolicy,
  signal?: AbortSignal,
): Promise<AwayControlPolicy> {
  if (!gameKey.trim() || !(AWAY_CONTROL_POLICIES as readonly string[]).includes(policy)) {
    throw new UserFacingError('validationFailed')
  }
  const result = await api<SettingsResponse>(`/games/${encodeURIComponent(gameKey)}/settings/away-control-policy`, {
    method: 'POST',
    body: JSON.stringify({ away_control_policy: policy }),
    signal,
  })
  assertSaved(result)
  return result.away_control_policy === 'ai_takeover' || result.away_control_policy === 'pause'
    ? result.away_control_policy
    : policy
}

function preferencesPath(gameKey: string): string {
  return `/games/${encodeURIComponent(gameKey)}/preferences`
}

function parsedPreferences(raw: unknown): SessionPreferencesState {
  const parsed = parseSessionPreferences(raw)
  if (!parsed) {
    const result = (raw ?? {}) as SettingsResponse
    throw new ApiError(result.error || getT()('settingFailed'), 200, errorCodeOf(result))
  }
  return parsed
}

/** 本局偏好（GM 专属，预览视角会 403）。 */
export async function fetchSessionPreferences(gameKey: string, signal?: AbortSignal): Promise<SessionPreferencesState> {
  return parsedPreferences(await api<unknown>(preferencesPath(gameKey), { signal }))
}

/**
 * 只提交改动的字段；服务端拒收未知键（INVALID_PREFERENCES）。关掉孤注一掷会顺带
 * 关闭进行中的申请并尝试继续本轮，所以保存后调用方要刷新对局状态。
 */
export async function patchSessionPreferences(
  gameKey: string,
  patch: SessionPreferencesPatch,
  signal?: AbortSignal,
): Promise<SessionPreferencesState> {
  return parsedPreferences(await api<unknown>(preferencesPath(gameKey), {
    method: 'POST',
    body: JSON.stringify({ preferences: patch }),
    signal,
  }))
}
