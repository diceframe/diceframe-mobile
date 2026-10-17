import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { fetchCheckModes, mutateCheckMode } from './check-modes'

vi.mock('./client', async (importOriginal) => ({ ...(await importOriginal<typeof import('./client')>()), api: vi.fn() }))

const mockedApi = vi.mocked(api)
const state = { ok: true, revision: 2, run_id: 'r', is_gm: false, seats: [] }

describe('检定模式 API', () => {
  beforeEach(() => mockedApi.mockReset())

  it('路径段编码，POST 带请求体', async () => {
    mockedApi.mockResolvedValue(state)
    await fetchCheckModes('g/1')
    expect(mockedApi).toHaveBeenLastCalledWith('/games/g%2F1/check-modes', { signal: undefined })
    await mutateCheckMode('g/1', 'u/2', 'request', { expected_revision: 2, run_id: 'r', context_id: 'c', mode: 'advantage', reason: '高处' })
    const [path, init] = mockedApi.mock.lastCall!
    expect(path).toBe('/games/g%2F1/check-modes/seats/u%2F2/request')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toMatchObject({ mode: 'advantage', reason: '高处' })
  })

  it('响应不合契约时抛错并带错误码', async () => {
    mockedApi.mockResolvedValue({ ok: false, error_code: 'invalid_or_stale_request' })
    await expect(fetchCheckModes('g')).rejects.toMatchObject({ code: 'invalid_or_stale_request' })
  })
})
