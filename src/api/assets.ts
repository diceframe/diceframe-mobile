/**
 * 二进制资源（头像/场景图/生成图）的加载，与 Web 端 PortraitImage 的策略一致：
 * /api 资源不交给图片加载器（原生下载器的鉴权与 Content-Type 行为不可控），
 * 而是经 apiBlob 下载字节后转 data URI 本地渲染；内置头像等静态资源才用直链。
 */
import { apiBlob, buildStaticAssetUrl, buildUrl, shareQuery } from './client'
import type { CharacterPortrait, SceneImageRef } from './types'

export interface AssetSource {
  /** 完整 URL（静态直链，或 API 地址，仅用于 key/调试展示） */
  uri: string
  /** 相对 API 路径；存在时必须经 apiAssetDataUri() 下载后渲染 */
  apiPath?: string
}

export function assetSource(path: string): AssetSource {
  return { uri: buildUrl(path, shareQuery() ?? undefined), apiPath: path }
}

/**
 * 地图素材 URL（服务端给出，对齐 Web 直接 <img src> 的字段）：
 * - `/api/...`（地图背景/插件图标等鉴权资源）→ 经 apiBlob 下载转 data URI
 * - `/v2-assets/...`（内置预设底图）→ 静态直链
 * - 绝对 http(s) → 直链；其他未知格式不渲染
 */
export function mapAssetSource(url?: string | null): AssetSource | null {
  const value = String(url ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return { uri: value }
  if (value.startsWith('/api/')) return assetSource(value.slice('/api'.length))
  if (value.startsWith('/v2-assets/')) {
    return { uri: buildStaticAssetUrl(value.slice('/v2-assets'.length)) }
  }
  return null
}

const dataUriCache = new Map<string, string>()
const inflightDownloads = new Map<string, Promise<string>>()

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取资源数据失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 下载需要鉴权的 /api 二进制资源并转为 data URI（按 apiPath 会话级缓存，
 * 对齐 Web 端 uploadedAvatarUrl 的 Map 缓存）。
 */
export async function apiAssetDataUri(apiPath: string): Promise<string> {
  const cached = dataUriCache.get(apiPath)
  if (cached) return cached
  // 并发请求同一资源时（如时间线里同一头像多次出现）共享一次下载
  const pending = inflightDownloads.get(apiPath)
  if (pending) return pending
  const download = (async () => {
    try {
      const response = await apiBlob(apiPath)
      const dataUri = await blobToDataUri(await response.blob())
      dataUriCache.set(apiPath, dataUri)
      return dataUri
    } finally {
      inflightDownloads.delete(apiPath)
    }
  })()
  inflightDownloads.set(apiPath, download)
  return download
}

/** 规则内置场景图（对齐 Web useBackgroundImages 的 RULE_SCENE_SLOTS/DEFAULT_URLS） */
const RULE_SCENE_ASSETS: Record<string, string> = {
  dnd5e: '/ui/campaign-mountain-city.jpg',
  freeform_fantasy: '/ui/rules/rule-freeform-fantasy.webp',
  freeform_coc: '/ui/rules/rule-freeform-coc.webp',
  freeform_cyberpunk: '/ui/rules/rule-freeform-cyberpunk.webp',
  freeform_wuxia: '/ui/rules/rule-freeform-wuxia.webp',
  tavern_free: '/ui/rules/rule-tavern-free.webp',
}

/** rule_id → 内置场景静态资源路径；未知规则回退 freeform_fantasy（同 Web ruleSceneSlot） */
export function ruleSceneAssetPath(ruleId?: string | null): string {
  return RULE_SCENE_ASSETS[String(ruleId || '').trim()] ?? RULE_SCENE_ASSETS.freeform_fantasy
}

/**
 * 冒险封面：优先 /games/{key}/scene-image（服务端已含默认场景回退，鉴权经
 * apiBlob），下载失败时组件回退到 uri 的规则内置场景直链（静态资源免鉴权）。
 */
export function gameSceneCoverSource(gameKey: string, ruleId?: string | null): AssetSource {
  return {
    uri: buildStaticAssetUrl(ruleSceneAssetPath(ruleId)),
    apiPath: `/games/${encodeURIComponent(gameKey)}/scene-image`,
  }
}

export function avatarSource(
  gameKey: string,
  portrait?: CharacterPortrait | null,
): AssetSource | null {
  if (!portrait) return null

  if (portrait.kind === 'builtin') {
    const [rawRule, rawIndex] = String(portrait.id || '').split(':')
    const rule = rawRule.replace(/_en$/, '')
    const index = Number(rawIndex)
    const supportedRules = new Set([
      'dnd5e',
      'freeform_coc',
      'freeform_cyberpunk',
      'freeform_fantasy',
      'freeform_wuxia',
      'tavern_free',
    ])
    if (!supportedRules.has(rule) || !Number.isInteger(index) || index < 0 || index > 7) return null
    const fileName = index < 4 ? `realistic-${index + 1}.jpg` : `anime-${index - 3}.jpg`
    return { uri: buildStaticAssetUrl(`/avatars/v3/${rule}/${fileName}`) }
  }

  if (portrait.kind === 'upload' && portrait.asset_id) {
    return assetSource(
      `/games/${encodeURIComponent(gameKey)}/avatars/${encodeURIComponent(portrait.asset_id)}`,
    )
  }

  if (portrait.kind === 'generated' && portrait.asset_id) {
    return assetSource(
      `/games/${encodeURIComponent(gameKey)}/generated-images/${encodeURIComponent(portrait.asset_id)}`,
    )
  }

  if (portrait.kind === 'plugin' && portrait.plugin_id && portrait.path) {
    const path = portrait.path.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')
    return assetSource(`/plugins/assets/${encodeURIComponent(portrait.plugin_id)}/${path}`)
  }

  return null
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
