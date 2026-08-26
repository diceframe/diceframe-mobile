import { api } from './client'
import type { CharacterCard, CharacterCardsResponse, RuleSummary, RulesResponse } from './types'

export interface WorldRecord {
  id?: string
  world_id?: string
  name?: string
  world_name?: string
  description?: string
  entry_count?: number
  language?: string
}

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
    method: 'POST', body: JSON.stringify({ name, description, language: 'zh-CN' }),
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
  return api<RulesResponse>('/rules?language=zh-CN')
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
