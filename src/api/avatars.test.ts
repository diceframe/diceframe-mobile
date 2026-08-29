import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './client'
import { deleteUserAvatar, listUserAvatars, uploadAvatar } from './avatars'
import { generateAvatarImage } from './images'

vi.mock('./client', () => ({ api: vi.fn() }))

const mockedApi = vi.mocked(api)

describe('avatar API contracts', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('posts pure base64 file data to the global avatar route', async () => {
    mockedApi.mockResolvedValueOnce({ ok: true, portrait: { kind: 'upload', asset_id: 'a' } })
    const portrait = await uploadAvatar({ fileName: 'avatar.png', fileData: 'aGk=' })

    expect(portrait).toEqual({ kind: 'upload', asset_id: 'a' })
    expect(mockedApi).toHaveBeenCalledWith('/avatars', {
      method: 'POST',
      body: JSON.stringify({ file_name: 'avatar.png', file_data: 'aGk=' }),
    })
  })

  it('throws when the server rejects the upload', async () => {
    mockedApi.mockResolvedValueOnce({ ok: false, error: '太大' })
    await expect(uploadAvatar({ fileName: 'a.png', fileData: 'x' })).rejects.toThrow('太大')
  })

  it('lists and deletes user avatars with encoded asset ids', async () => {
    await listUserAvatars()
    await deleteUserAvatar('portrait/a')

    expect(mockedApi).toHaveBeenNthCalledWith(1, '/avatars')
    expect(mockedApi).toHaveBeenNthCalledWith(2, '/avatars/portrait%2Fa', { method: 'DELETE' })
  })
})

describe('generated avatar contract', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    mockedApi.mockResolvedValue({})
  })

  it('requests a 1:1 avatar with name and rule context', async () => {
    mockedApi.mockResolvedValueOnce({ ok: true, asset_id: 'img-1' })
    const assetId = await generateAvatarImage({ prompt: '精灵游侠', name: '莱拉', ruleId: 'dnd5e' })

    expect(assetId).toBe('img-1')
    expect(mockedApi).toHaveBeenCalledWith('/generated-images', {
      method: 'POST',
      body: JSON.stringify({
        purpose: 'avatar',
        prompt: '精灵游侠',
        aspect_ratio: '1:1',
        style: '',
        context: { character_name: '莱拉', rule_id: 'dnd5e' },
      }),
    })
  })

  it('falls back to a character-name prompt server side expectation and throws without asset', async () => {
    mockedApi.mockResolvedValueOnce({ ok: true })
    await expect(generateAvatarImage({ prompt: 'x' })).rejects.toThrow('生成头像失败')
  })
})
