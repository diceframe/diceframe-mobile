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
import { getT } from '@/i18n/t'

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

export const DEFAULT_GM_STYLE: GmStyle = { tone: '', verbosity: 'normal', custom_instructions: '' }

/** 内容语言归一化（对齐 Web normalizeLocale）：日语、英语归类，其余视为中文 */
function contentLanguageOf(language?: string | null): 'zh-CN' | 'en' | 'ja' {
  const value = String(language ?? '').trim().toLowerCase()
  if (value.startsWith('ja') || value.includes('日本語')) return 'ja'
  if (value.startsWith('en')) return 'en'
  return 'zh-CN'
}

/** 语言展示标签（对齐 Web languageLabel）；各语言一律用自身名字显示，刻意不随界面语言翻译 */
export function languageLabel(language?: string | null): string {
  const normalized = contentLanguageOf(language)
  if (normalized === 'ja') return '日本語'
  if (normalized === 'en') return 'English'
  return '中文'
}

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
 * 世界图鉴数据：模板 + 用户世界合并去重，用户世界按内容语言过滤（移动端固定中文）。
 * 冒险包列表失败时降级为无徽章（对齐 Web 的容错）。
 */
export function useWorlds() {
  const [cards, setCards] = React.useState<WorldGalleryCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  // 不手写 useCallback（React Compiler 已开启）；load 只依赖模块级 api 函数，effect 跑一次即可
  async function load() {
    setLoading(true)
    try {
      const [templateData, worldData, adventureData] = await Promise.all([
        fetchWorldTemplates(),
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
        if (contentLanguageOf(world.language) !== 'zh-CN') continue
        const card = worldToCard(world, adventureNames.get(worldIdOf(world)) ?? '')
        if (!card || seen.has(card.id)) continue
        seen.add(card.id)
        next.push(card)
      }
      setCards(next)
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    queueMicrotask(() => void load())
  }, [])

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
    const result = await updateWorldGmStyle(card.id, {
      tone: gmStyle.tone ?? '',
      verbosity: gmStyle.verbosity ?? 'normal',
      custom_instructions: gmStyle.custom_instructions ?? '',
    })
    if (result.ok === false || result.error) throw new Error(result.error || getT()('dfWorldsSaveStyleFailed'))
    await load()
  }

  return { cards, loading, error, refresh: load, clone, remove, saveGmStyle }
}
