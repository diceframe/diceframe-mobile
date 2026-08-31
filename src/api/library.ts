import { api } from './client'
import { contentLanguage } from '@/i18n/t'
import type {
  CharacterCard,
  CharacterCardsResponse,
  CharacterSchemaResponse,
  GmStyle,
  RuleSummary,
  RulesResponse,
  WorldCloneResponse,
  WorldSummary,
} from './types'

/** 用户世界行（GET /worlds，含 GM 风格与场景图附加字段）；旧名保留为别名 */
export type WorldRecord = WorldSummary

export interface LoreRecord {
  id?: string
  world_id?: string
  name: string
  type?: string
  tier?: string
  content?: string
  keywords?: string[]
}

export interface InstalledPlugin {
  id: string
  name: string
  version?: string
  description?: string
  enabled: boolean
  running: boolean
  status?: string
  error?: string
}

export interface MarketplacePlugin {
  id: string
  name: string
  version?: string
  description?: string
  installed?: boolean
  installed_version?: string
  installable?: boolean
  verification_error?: string
  author?: unknown
}

export interface MemoryRecord {
  id: number
  /** 服务端 memory_entries 列：entity/relation/value/confidence 四字段可经 PUT 编辑 */
  entity?: string
  relation?: string
  value?: string
  confidence?: number
  content?: string
  text?: string
  summary?: string
  weight?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function fetchCharacterCards(): Promise<CharacterCardsResponse> {
  return api<CharacterCardsResponse>('/character-cards')
}

export function createCharacterCard(card: CharacterCard) {
  return api<{ ok?: boolean; error?: string; card?: CharacterCard }>('/character-cards', {
    method: 'POST', body: JSON.stringify(card),
  })
}

export function updateCharacterCard(cardId: string, patch: Partial<CharacterCard>) {
  return api<{ ok?: boolean; error?: string; card?: CharacterCard }>(`/character-cards/${encodeURIComponent(cardId)}`, {
    method: 'PUT', body: JSON.stringify(patch),
  })
}

export function deleteCharacterCard(cardId: string) {
  return api<{ ok?: boolean; error?: string }>(`/character-cards/${encodeURIComponent(cardId)}`, { method: 'DELETE' })
}

export function fetchWorlds() {
  return api<{ worlds?: WorldRecord[]; total?: number }>('/worlds')
}

export function createWorld(name: string, description = '') {
  return api<{ ok?: boolean; error?: string; world_id?: string }>('/worlds', {
    method: 'POST', body: JSON.stringify({ name, description, language: contentLanguage() }),
  })
}

/** 从模板克隆为「我的世界」（内置/插件世界也能克隆；自建世界无需再克隆） */
export function cloneWorldFromTemplate(templateId: string, name?: string): Promise<WorldCloneResponse> {
  return api<WorldCloneResponse>('/worlds/clone-from-template', {
    method: 'POST',
    body: JSON.stringify(name ? { template_id: templateId, name } : { template_id: templateId }),
  })
}

/** 更新用户自建世界的 GM 叙事风格（内置/插件世界服务端会拒绝） */
export function updateWorldGmStyle(worldId: string, gmStyle: GmStyle) {
  return api<{ ok?: boolean; error?: string; gm_style?: GmStyle }>(
    `/worlds/${encodeURIComponent(worldId)}/gm-style`,
    { method: 'PUT', body: JSON.stringify({ gm_style: gmStyle }) },
  )
}

export function deleteWorld(worldId: string) {
  return api<{ ok?: boolean; error?: string }>(`/worlds/${encodeURIComponent(worldId)}`, {
    method: 'DELETE',
  })
}

export function fetchLoreEntries(worldId: string) {
  return api<{ entries?: LoreRecord[]; total?: number }>(`/lorebook/${encodeURIComponent(worldId)}`)
}

export function createLoreEntry(entry: LoreRecord) {
  return api<{ ok?: boolean; error?: string }>('/lorebook', { method: 'POST', body: JSON.stringify(entry) })
}

export function updateLoreEntry(entryId: string, patch: Partial<LoreRecord>) {
  return api<{ ok?: boolean; error?: string }>(`/lorebook/${encodeURIComponent(entryId)}`, {
    method: 'PUT', body: JSON.stringify(patch),
  })
}

export function deleteLoreEntry(entryId: string) {
  return api<{ ok?: boolean; error?: string }>(`/lorebook/${encodeURIComponent(entryId)}`, { method: 'DELETE' })
}

export function fetchInstalledPlugins() {
  return api<{ plugins?: InstalledPlugin[]; total?: number }>('/plugins')
}

export function fetchMarketplacePlugins() {
  return api<{ ok?: boolean; error?: string; plugins?: MarketplacePlugin[]; total?: number }>('/plugins/marketplace')
}

export function controlPlugin(pluginId: string, action: 'start' | 'stop') {
  return api<{ ok?: boolean; error?: string }>(`/plugins/${encodeURIComponent(pluginId)}/${action}`, { method: 'POST', body: '{}' })
}

export function installMarketplacePlugin(pluginId: string) {
  return api<{ ok?: boolean; error?: string }>('/plugins/marketplace/install', {
    method: 'POST', body: JSON.stringify({ plugin_id: pluginId, overwrite: false }),
  })
}

export function uninstallPlugin(pluginId: string) {
  return api<{ ok?: boolean; error?: string }>(`/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'DELETE', body: JSON.stringify({ delete_data: false }),
  })
}

export function fetchRuleLibrary(): Promise<RulesResponse> {
  return api<RulesResponse>(`/rules?language=${contentLanguage()}`)
}

/** 规则角色模式：技能池 / 技能上限 / 规则元数据（编辑角色卡时用） */
export function fetchCharacterSchema(ruleId: string, language = contentLanguage()): Promise<CharacterSchemaResponse> {
  return api<CharacterSchemaResponse>(
    `/rules/${encodeURIComponent(ruleId)}/character-schema?language=${encodeURIComponent(language)}`,
  )
}

export function createCustomRule(payload: { source_rule_id: string; rule_id: string; rule_name: string; description: string }) {
  return api<{ ok?: boolean; error?: string; rule?: RuleSummary }>('/rules', {
    method: 'POST', body: JSON.stringify(payload),
  })
}

export function deleteCustomRule(ruleId: string) {
  return api<{ ok?: boolean; error?: string }>(`/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' })
}

export function fetchMemories(gameKey: string, keyword = '') {
  const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''
  return api<{ entries?: MemoryRecord[]; memories?: MemoryRecord[]; total?: number }>(`/games/${encodeURIComponent(gameKey)}/memories${query}`)
}

export function updateMemory(gameKey: string, entryId: number, patch: Partial<MemoryRecord>) {
  return api<{ ok?: boolean; error?: string }>(`/games/${encodeURIComponent(gameKey)}/memories/${entryId}`, {
    method: 'PUT', body: JSON.stringify(patch),
  })
}

export function deleteMemory(gameKey: string, entryId: number) {
  return api<{ ok?: boolean; error?: string }>(`/games/${encodeURIComponent(gameKey)}/memories/${entryId}`, { method: 'DELETE' })
}
