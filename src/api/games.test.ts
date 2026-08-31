import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { regenerateSwipe, switchSwipe } from './games'

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
