/**
 * 全局头像端点（跨对局角色卡库使用；Web 端在局内会走 /games/{key}/avatars，
 * 移动端名册不绑定对局，固定全局路由）。file_data 为纯 base64，无 dataURI 前缀。
 */
import { api } from './client'
import type { CharacterPortrait } from './types'

/** 服务端 MAX_UPLOAD_BYTES（src/webui/services/avatars.py） */
export const MAX_AVATAR_BYTES = 3 * 1024 * 1024

export interface UserAvatar {
  asset_id: string
  size_kb?: number
  [key: string]: unknown
}

export interface UserAvatarsResponse {
  avatars?: UserAvatar[]
  total?: number
}

export async function uploadAvatar(input: { fileName: string; fileData: string }): Promise<CharacterPortrait> {
  const result = await api<{ ok?: boolean; error?: string; portrait?: CharacterPortrait }>('/avatars', {
    method: 'POST',
    body: JSON.stringify({ file_name: input.fileName, file_data: input.fileData }),
  })
  if (!result.ok || !result.portrait) throw new Error(result.error || '头像上传失败')
  return result.portrait
}

export function listUserAvatars(): Promise<UserAvatarsResponse> {
  return api<UserAvatarsResponse>('/avatars')
}

export async function deleteUserAvatar(assetId: string): Promise<void> {
  const result = await api<{ ok?: boolean; error?: string }>(`/avatars/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
  })
  if (result.ok === false) throw new Error(result.error || '删除头像失败')
}
