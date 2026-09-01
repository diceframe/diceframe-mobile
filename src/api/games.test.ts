import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { regenerateSwipe, switchSwipe, updateCharacterPortrait, updateRulesetCharacterProfile } from './games'

vi.mock('./client', () => ({ api: vi.fn() }))

const mockedApi = vi.mocked(api)

describe('games API swipe contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('switches swipe via POST with swipe_index body', async () => {
    await switchSwipe('game/a', 3, 1)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/swipe/3', {
      method: 'POST',
      body: JSON.stringify({ swipe_index: 1 }),
    })
  })

  it('regenerates a swipe via PUT with empty body', async () => {
    await regenerateSwipe('game/a', 3)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/swipe/3', {
      method: 'PUT',
      body: '{}',
    })
  })
})

describe('games API portrait contracts', () => {
  const portrait = { kind: 'builtin' as const, id: 'dnd5e:0' }

  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('legacy 局 PUT 整卡端点，body 只带 portrait', async () => {
    await updateCharacterPortrait('game/a', 'user/1', portrait)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/character/user%2F1', {
      method: 'PUT',
      body: JSON.stringify({ portrait }),
    })
  })

  it('rules-aware 局 PATCH profile 端点，body 只带 portrait', async () => {
    await updateRulesetCharacterProfile('game/a', 'user/1', null)

    expect(mockedApi).toHaveBeenCalledWith('/games/game%2Fa/character/user%2F1/profile', {
      method: 'PATCH',
      body: JSON.stringify({ portrait: null }),
    })
  })
})
