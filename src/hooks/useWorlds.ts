import * as React from 'react'

import { errorMessage } from '@/api/client'
import { fetchAdventures, fetchWorldTemplates } from '@/api/games'
import {
  cloneWorldFromTemplate,
  deleteWorld,
  fetchWorlds,
  updateWorldGmStyle,
} from '@/api/library'
import type { GmStyle, SceneImageRef, WorldSummary, WorldTemplateSummary } from '@/api/types'
import { contentLanguage, getT, useT } from '@/i18n/t'
import { worldGmStyleUpdate } from '@/lib/gm-style'
import { worldContentLocale } from '@/lib/world-language'

/** 图鉴卡片（对齐 Web WorldsView 的 GalleryCard） */
export interface WorldGalleryCard {
  id: string
  name: string
  description: string
  language: string
  source: 'builtin' | 'user' | 'plugin'
  lorebookCount: number
  defaultRule: string
  sceneImage?: SceneImageRef | null
  gmStyle: GmStyle | null
  /** 被冒险包推荐时的冒险包名（用于徽章） */
  adventureName: string
}

export const DEFAULT_GM_STYLE: GmStyle = { tone: '', verbosity: 'normal', pace: 'normal', custom_instructions: '' }

function templateIdOf(template: WorldTemplateSummary): string {
  return String(template.world_id || template.id || '')
}

function worldIdOf(world: WorldSummary): string {
  return String(world.id || world.world_id || '')
}

function templateToCard(template: WorldTemplateSummary, adventureName: string): WorldGalleryCard | null {
  const id = templateIdOf(template)
  if (!id || template.game_scoped) return null
  return {
    id,
    name: String(template.world_name || template.name || id),
    description: String(template.description || ''),
    language: String(template.active_locale || template.language || 'zh-CN'),
    source: template.source ?? 'builtin',
    lorebookCount: Number(template.lorebook_count ?? 0),
    defaultRule: String(template.default_rule || ''),
    sceneImage: template.scene_image ?? null,
    gmStyle: template.gm_style ?? null,
    adventureName,
  }
}

function worldToCard(world: WorldSummary, adventureName: string): WorldGalleryCard | null {
  const id = worldIdOf(world)
  if (!id) return null
  return {
    id,
    name: String(world.world_name || world.name || id),
    description: String(world.description || ''),
    language: String(world.language || 'zh-CN'),
    source: 'user',
    lorebookCount: Number(world.entry_count ?? 0),
    defaultRule: '',
    sceneImage: world.scene_image ?? null,
    gmStyle: world.gm_style ?? null,
    adventureName,
  }
}

/**
 * 世界图鉴数据：模板 + 用户世界合并去重，用户世界按当前界面/内容语言过滤。
 * 冒险包列表失败时降级为无徽章（对齐 Web 的容错）。
 */
export function useWorlds() {
  useT() // 订阅语言切换，切换后重新按当前内容语言拉取/筛选
  const locale = contentLanguage()
  const [cards, setCards] = React.useState<WorldGalleryCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const loadVersion = React.useRef(0)

  // 不手写 useCallback（React Compiler 已开启）；语言切换时重新拉取对应内容目录
  async function load() {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const [templateData, worldData, adventureData] = await Promise.all([
        fetchWorldTemplates(locale),
        fetchWorlds(),
        fetchAdventures().catch(() => ({ adventures: [] as { name?: string; recommended_world_id?: string }[] })),
      ])
      const adventureNames = new Map<string, string>()
      for (const adventure of adventureData.adventures ?? []) {
        const worldId = String(adventure.recommended_world_id || '')
        if (worldId && adventure.name && !adventureNames.has(worldId)) {
          adventureNames.set(worldId, adventure.name)
        }
      }
      const next: WorldGalleryCard[] = []
      const seen = new Set<string>()
      for (const template of templateData.templates ?? []) {
        const card = templateToCard(template, adventureNames.get(templateIdOf(template)) ?? '')
        if (!card || seen.has(card.id)) continue
        seen.add(card.id)
        next.push(card)
      }
      for (const world of worldData.worlds ?? []) {
        // 用户世界按内容语言过滤，避免中文界面混入 *_en 异语世界（对齐 Web）
        if (worldContentLocale(world.language) !== locale) continue
        const card = worldToCard(world, adventureNames.get(worldIdOf(world)) ?? '')
        if (!card || seen.has(card.id)) continue
        seen.add(card.id)
        next.push(card)
      }
      if (version !== loadVersion.current) return
      setCards(next)
      setError('')
    } catch (cause) {
      if (version === loadVersion.current) setError(errorMessage(cause))
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }

  React.useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
      loadVersion.current += 1
    }
  }, [locale])

  async function clone(card: WorldGalleryCard) {
    const result = await cloneWorldFromTemplate(card.id)
    if (result.ok === false || result.error) throw new Error(result.error || getT()('dfWorldsCloneFailed'))
    await load()
  }

  async function remove(card: WorldGalleryCard) {
    const result = await deleteWorld(card.id)
    if (result.ok === false || result.error) throw new Error(result.error || getT()('dfWorldsDeleteFailed'))
    await load()
  }

  async function saveGmStyle(card: WorldGalleryCard, gmStyle: GmStyle) {
    const result = await updateWorldGmStyle(card.id, worldGmStyleUpdate(card.gmStyle, gmStyle))
    if (result.ok === false || result.error) throw new Error(result.error || getT()('dfWorldsSaveStyleFailed'))
    await load()
  }

  return { cards, loading, error, refresh: load, clone, remove, saveGmStyle }
}
