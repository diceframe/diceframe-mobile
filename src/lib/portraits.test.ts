import { describe, expect, it } from 'vitest'

import { builtinPortraitAssetPath, builtinPortraitChoices, builtinRuleId } from './portraits'

describe('builtin portrait catalog', () => {
  it('normalizes rule ids and falls back to freeform_fantasy', () => {
    expect(builtinRuleId('dnd5e')).toBe('dnd5e')
    expect(builtinRuleId('dnd5e_en')).toBe('dnd5e')
    expect(builtinRuleId('')).toBe('freeform_fantasy')
    expect(builtinRuleId('unknown_rule')).toBe('freeform_fantasy')
  })

  it('lists 8 choices per rule with stable ids and asset paths', () => {
    const choices = builtinPortraitChoices('freeform_coc')
    expect(choices).toHaveLength(8)
    expect(choices[0].id).toBe('freeform_coc:0')
    expect(choices[0].assetPath).toBe('/avatars/v3/freeform_coc/realistic-1.jpg')
    expect(choices[7].assetPath).toBe('/avatars/v3/freeform_coc/anime-4.jpg')
  })

  it('resolves stored portrait ids tolerating the _en suffix and rejects bad ones', () => {
    expect(builtinPortraitAssetPath('dnd5e:0')).toBe('/avatars/v3/dnd5e/realistic-1.jpg')
    expect(builtinPortraitAssetPath('dnd5e_en:4')).toBe('/avatars/v3/dnd5e/anime-1.jpg')
    expect(builtinPortraitAssetPath('dnd5e:8')).toBeNull()
    expect(builtinPortraitAssetPath('made_up:0')).toBeNull()
    expect(builtinPortraitAssetPath('dnd5e')).toBeNull()
  })
})
