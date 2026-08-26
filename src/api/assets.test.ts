import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiAssetDataUri, avatarSource, gameSceneCoverSource, libraryAvatarSource, ruleSceneAssetPath } from './assets'
import { apiBlob, configureApiClient } from './client'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiBlob: vi.fn() }
})

class FileReaderStub {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(_blob: Blob) {
    this.result = 'data:image/webp;base64,eA=='
    this.onload?.()
  }
}

;(globalThis as { FileReader?: unknown }).FileReader = FileReaderStub

describe('avatarSource', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'http://h:18000', token: null, share: null })
  })

  it('把内置头像的 rule:index 映射到静态头像资源直链', () => {
    expect(avatarSource('game-1', { kind: 'builtin', id: 'dnd5e:4' })).toEqual({
      uri: 'http://h:18000/v2-assets/avatars/v3/dnd5e/anime-1.jpg',
    })
  })

  it('保留上传、生成和插件头像的 API 资源映射', () => {
    expect(avatarSource('game-1', { kind: 'upload', asset_id: 'avatar-1' })).toEqual({
      uri: 'http://h:18000/api/games/game-1/avatars/avatar-1',
      apiPath: '/games/game-1/avatars/avatar-1',
    })
    expect(avatarSource('game-1', { kind: 'generated', asset_id: 'image-1' })).toEqual({
      uri: 'http://h:18000/api/games/game-1/generated-images/image-1',
      apiPath: '/games/game-1/generated-images/image-1',
    })
    expect(
      avatarSource('game-1', { kind: 'plugin', plugin_id: 'plugin/a', path: 'assets/portrait.png' }),
    ).toEqual({
      uri: 'http://h:18000/api/plugins/assets/plugin%2Fa/assets/portrait.png',
      apiPath: '/plugins/assets/plugin%2Fa/assets/portrait.png',
    })
  })

  it('内置头像引用无效时回退到默认头像', () => {
    expect(avatarSource('game-1', { kind: 'builtin', id: 'unknown:99' })).toBeNull()
  })
})

describe('libraryAvatarSource', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'http://h:18000', token: null, share: null })
  })

  it('uses global resources for reusable character-card portraits', () => {
    expect(libraryAvatarSource({ kind: 'builtin', id: 'dnd5e:0' })).toEqual({
      uri: 'http://h:18000/v2-assets/avatars/v3/dnd5e/realistic-1.jpg',
    })
    expect(libraryAvatarSource({ kind: 'upload', asset_id: 'portrait/a' })).toEqual({
      uri: 'http://h:18000/api/avatars/portrait%2Fa',
      apiPath: '/avatars/portrait%2Fa',
    })
    expect(libraryAvatarSource({ kind: 'generated', asset_id: 'image/a' })).toEqual({
      uri: 'http://h:18000/api/generated-images/image%2Fa',
      apiPath: '/generated-images/image%2Fa',
    })
    expect(libraryAvatarSource({ kind: 'plugin', plugin_id: 'plugin/a', path: 'portraits/hero.png' })).toEqual({
      uri: 'http://h:18000/api/plugins/assets/plugin%2Fa/portraits/hero.png',
      apiPath: '/plugins/assets/plugin%2Fa/portraits/hero.png',
    })
  })

  it('returns no image for an absent or invalid portrait reference', () => {
    expect(libraryAvatarSource(null)).toBeNull()
    expect(libraryAvatarSource({ kind: 'builtin', id: 'missing:0' })).toBeNull()
  })
})

describe('gameSceneCoverSource', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'http://h:18000', token: null, share: null })
  })

  it('封面主图走 /games/{key}/scene-image，回退直链指向规则内置场景', () => {
    expect(gameSceneCoverSource('game/1', 'freeform_coc')).toEqual({
      uri: 'http://h:18000/v2-assets/ui/rules/rule-freeform-coc.webp',
      apiPath: '/games/game%2F1/scene-image',
    })
  })

  it('dnd5e 用专属场景图，未知规则回退 freeform_fantasy（对齐 Web ruleSceneSlot）', () => {
    expect(ruleSceneAssetPath('dnd5e')).toBe('/ui/campaign-mountain-city.jpg')
    expect(ruleSceneAssetPath('unknown_rule')).toBe('/ui/rules/rule-freeform-fantasy.webp')
    expect(ruleSceneAssetPath('')).toBe('/ui/rules/rule-freeform-fantasy.webp')
    expect(ruleSceneAssetPath(' freeform_wuxia ')).toBe('/ui/rules/rule-freeform-wuxia.webp')
  })
})

describe('apiAssetDataUri', () => {
  beforeEach(() => {
    vi.mocked(apiBlob).mockReset()
  })

  it('经 apiBlob 下载并按 apiPath 缓存 data URI', async () => {
    vi.mocked(apiBlob).mockResolvedValue({
      blob: async () => new Blob([new Uint8Array([1, 2])], { type: 'image/webp' }),
      headers: { get: () => 'image/webp' },
    } as unknown as Response)

    const first = await apiAssetDataUri('/games/g/avatars/cached-1')
    const second = await apiAssetDataUri('/games/g/avatars/cached-1')

    expect(first).toBe('data:image/webp;base64,eA==')
    expect(second).toBe(first)
    expect(apiBlob).toHaveBeenCalledTimes(1)
  })

  it('下载失败时抛出错误且不写入缓存', async () => {
    vi.mocked(apiBlob).mockRejectedValue(new Error('network'))

    await expect(apiAssetDataUri('/games/g/avatars/failed-1')).rejects.toThrow('network')
    await expect(apiAssetDataUri('/games/g/avatars/failed-1')).rejects.toThrow('network')
    expect(apiBlob).toHaveBeenCalledTimes(2)
  })
})
