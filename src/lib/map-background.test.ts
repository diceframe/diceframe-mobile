import { describe, expect, it } from 'vitest'

import { mapBackgroundOf, mapBackgroundValue } from './map-background'

describe('mapBackground 值互转', () => {
  it('未设置/自动/无背景往返一致', () => {
    expect(mapBackgroundValue(undefined)).toBe('auto')
    expect(mapBackgroundValue({ kind: 'auto' })).toBe('auto')
    expect(mapBackgroundValue({ kind: 'none' })).toBe('none')
    expect(mapBackgroundOf('auto')).toEqual({ kind: 'auto' })
    expect(mapBackgroundOf('none')).toEqual({ kind: 'none' })
  })

  it('内置地图与上传背景往返一致', () => {
    const builtin = { kind: 'builtin', id: 'fantasy-region-v1' } as const
    expect(mapBackgroundValue(builtin)).toBe('builtin:fantasy-region-v1')
    expect(mapBackgroundOf('builtin:fantasy-region-v1')).toEqual(builtin)

    const upload = { kind: 'upload', asset_id: 'a-9' } as const
    expect(mapBackgroundValue(upload)).toBe('upload:a-9')
    expect(mapBackgroundOf('upload:a-9')).toEqual(upload)
  })
})
