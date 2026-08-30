import { beforeEach, describe, expect, it } from 'vitest'

import { configureApiClient } from '@/api/client'

import { roundSceneImageSource } from './sceneImage'

describe('roundSceneImageSource', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'http://h:18000', token: null, share: null })
  })

  it('status=ready 的 generated 引用解析为生成图资源', () => {
    expect(
      roundSceneImageSource('game-1', {
        status: 'ready',
        reference: { kind: 'generated', asset_id: 'img1' },
      }),
    ).toEqual({
      uri: 'http://h:18000/api/generated-images/img1',
      apiPath: '/generated-images/img1',
    })
  })

  it('生成中/失败的回合不展示内嵌图（对齐 Web 的 ready 门槛）', () => {
    expect(
      roundSceneImageSource('game-1', {
        status: 'pending',
        reference: { kind: 'generated', asset_id: 'img1' },
      }),
    ).toBeNull()
    expect(
      roundSceneImageSource('game-1', {
        status: 'failed',
        reference: { kind: 'generated', asset_id: 'img1' },
      }),
    ).toBeNull()
  })

  it('缺引用或 asset_id 为空时不展示', () => {
    expect(roundSceneImageSource('game-1', { status: 'ready' })).toBeNull()
    expect(
      roundSceneImageSource('game-1', { status: 'ready', reference: { kind: 'generated' } }),
    ).toBeNull()
    expect(roundSceneImageSource('game-1', undefined)).toBeNull()
  })
})
