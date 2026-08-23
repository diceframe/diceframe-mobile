/**
 * 二进制资源（头像/场景图/生成图）的 URL 构造。
 * RN 的 Image 不走 fetch 封装，鉴权要么带 Authorization 头（expo-image 支持 headers），
 * 要么把玩家分享参数拼进 query（与 api() 的 shareQuery 一致）。
 */
import { buildUrl, currentToken, shareQuery } from './client'
import type { CharacterPortrait, SceneImageRef } from './types'

export interface AssetSource {
  uri: string
  headers: Record<string, string>
}

export function assetSource(path: string): AssetSource {
  const uri = buildUrl(path, shareQuery() ?? undefined)
  const headers: Record<string, string> = {}
  const token = currentToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return { uri, headers }
}

export function avatarSource(
  gameKey: string,
  portrait?: CharacterPortrait | null,
): AssetSource | null {
  if (!portrait?.asset_id) return null
  if (portrait.kind === 'builtin' || portrait.kind === 'plugin') return null
  return assetSource(
    `/games/${encodeURIComponent(gameKey)}/avatars/${encodeURIComponent(portrait.asset_id)}`,
  )
}

export function sceneImageSource(
  gameKey: string,
  reference?: SceneImageRef | null,
): AssetSource | null {
  if (!reference?.asset_id) return null
  const assetId = encodeURIComponent(reference.asset_id)
  if (reference.kind === 'upload') return assetSource(`/scene-images/${assetId}`)
  if (reference.kind === 'asset' || reference.kind === 'generated') {
    return assetSource(`/generated-images/${assetId}`)
  }
  return null
}
