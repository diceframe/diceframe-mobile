import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import {
  controlPlugin,
  createCharacterCard,
  createCustomRule,
  createLoreEntry,
  deleteMemory,
  fetchCharacterCards,
  fetchLoreEntries,
  fetchMemories,
  fetchRuleLibrary,
  fetchWorlds,
  installMarketplacePlugin,
  updateLoreEntry,
} from './library'

vi.mock('./client', () => ({ api: vi.fn() }))

const mockedApi = vi.mocked(api)

describe('library API contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('uses the server character-card routes and write method', async () => {
    await fetchCharacterCards()
    await createCharacterCard({ character_name: '莱拉' })

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/character-cards')
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/character-cards', {
      method: 'POST',
      body: JSON.stringify({ character_name: '莱拉' }),
    })
  })

  it('keeps canonical world and lore entry IDs in route parameters', async () => {
    await fetchWorlds()
    await fetchLoreEntries('world/a')
    await createLoreEntry({ world_id: 'world/a', name: '银塔' })
    await updateLoreEntry('entry/a', { content: '更新' })

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/worlds')
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/lorebook/world%2Fa')
    expect(mockedApi).toHaveBeenNthCalledWith(3, '/lorebook', {
      method: 'POST',
      body: JSON.stringify({ world_id: 'world/a', name: '银塔' }),
    })
    expect(mockedApi).toHaveBeenNthCalledWith(4, '/lorebook/entry%2Fa', {
      method: 'PUT',
      body: JSON.stringify({ content: '更新' }),
    })
  })

  it('uses plugin marketplace and lifecycle routes', async () => {
    await installMarketplacePlugin('plugin/a')
    await controlPlugin('plugin/a', 'start')

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/plugins/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({ plugin_id: 'plugin/a', overwrite: false }),
    })
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/plugins/plugin%2Fa/start', {
      method: 'POST',
      body: '{}',
    })
  })

  it('uses the custom-rule clone payload and localized rule listing', async () => {
    await fetchRuleLibrary()
    await createCustomRule({
      source_rule_id: 'dnd5e',
      rule_id: 'campaign_rule',
      rule_name: '战役规则',
      description: '',
    })

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/rules?language=zh-CN')
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/rules', {
      method: 'POST',
      body: JSON.stringify({
        source_rule_id: 'dnd5e',
        rule_id: 'campaign_rule',
        rule_name: '战役规则',
        description: '',
      }),
    })
  })

  it('scopes memory reads and deletes to an encoded game key', async () => {
    await fetchMemories('guild#42', '公爵')
    await deleteMemory('guild#42', 7)

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/games/guild%2342/memories?keyword=%E5%85%AC%E7%88%B5')
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/games/guild%2342/memories/7', { method: 'DELETE' })
  })
})
