import { api, ApiError, errorCodeOf } from './client'
import type { CharacterPortrait } from './types'
import { getT } from '@/i18n/t'
import { parseStorySpeakers, type StorySpeaker } from '@/lib/story-speakers'

function basePath(gameKey: string): string {
  return `/games/${encodeURIComponent(gameKey)}/story-speakers`
}

function assertOk(result: { ok?: boolean; error?: string; error_code?: string } | null | undefined): void {
  if (result?.ok === false) throw new ApiError(result.error || getT()('settingFailed'), 200, errorCodeOf(result))
}

/** GM 专属：本局出场过的全部说话人（含首末出场回合） */
export async function fetchStorySpeakers(gameKey: string): Promise<StorySpeaker[]> {
  const result = await api<{ ok?: boolean; error?: string; speakers?: unknown }>(basePath(gameKey))
  assertOk(result)
  return parseStorySpeakers(result)
}

export async function updateSpeakerPortrait(gameKey: string, speakerId: string, portrait: CharacterPortrait | null): Promise<void> {
  assertOk(await api<{ ok?: boolean; error?: string }>(`${basePath(gameKey)}/${encodeURIComponent(speakerId)}/portrait`, {
    method: 'PUT',
    body: JSON.stringify({ portrait }),
  }))
}

export async function mergeStorySpeakers(gameKey: string, sourceId: string, targetId: string): Promise<void> {
  assertOk(await api<{ ok?: boolean; error?: string }>(`${basePath(gameKey)}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
  }))
}
