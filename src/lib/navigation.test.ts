import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const tabs = source('../app/(tabs)/_layout.tsx')
const profile = source('../app/(tabs)/profile.tsx')
const play = source('../app/play/[gameKey].tsx')

describe('mobile information architecture', () => {
  it('keeps only primary destinations in the bottom or tablet navigation', () => {
    for (const route of ['overview', 'characters', 'lorebook', 'profile']) {
      expect(tabs).toContain(`name="${route}"`)
    }
    expect(tabs).not.toContain('name="plugins"')
    expect(tabs).not.toContain('name="settings"')
  })

  it('keeps low-frequency tools under profile', () => {
    for (const route of ['/plugins', '/memory', '/logs', '/rules']) {
      expect(profile).toContain(`router.push('${route}')`)
    }
    expect(profile).not.toContain("router.push('/peer')")
  })

  it('separates play context from GM management', () => {
    expect(play).toContain('情境入口')
    expect(play).toContain('gmRoundControls')
    expect(play).toContain('GM 桌面管理')
    expect(play).toContain('value="players"')
    expect(play).toContain('value="health"')
  })
})
