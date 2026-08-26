import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const tabs = source('../app/(tabs)/_layout.tsx')
const profile = source('../app/(tabs)/profile.tsx')
const settings = source('../app/(profile)/settings.tsx')
const play = source('../app/play/[gameKey].tsx')

describe('mobile information architecture', () => {
  it('keeps only primary destinations in the bottom or tablet navigation', () => {
    for (const route of ['overview', 'characters', 'lorebook', 'profile']) {
      expect(tabs).toContain(`name="${route}"`)
    }
    expect(tabs).not.toContain('name="plugins"')
    expect(tabs).not.toContain('name="settings"')
  })

  it('keeps route files aligned with the visible information hierarchy', () => {
    const appUrl = new URL('../app/', import.meta.url)
    for (const relativePath of [
      '(auth)/login.tsx',
      '(auth)/join.tsx',
      '(profile)/settings.tsx',
      '(profile)/plugins.tsx',
      '(profile)/memory.tsx',
      '(profile)/logs.tsx',
      '(profile)/rules.tsx',
      '(profile)/legal/index.tsx',
    ]) {
      expect(existsSync(fileURLToPath(new URL(relativePath, appUrl)))).toBe(true)
    }
    for (const flatPage of ['login.tsx', 'join.tsx', 'settings.tsx', 'plugins.tsx', 'memory.tsx', 'logs.tsx', 'rules.tsx']) {
      expect(existsSync(fileURLToPath(new URL(flatPage, appUrl)))).toBe(false)
    }
  })

  it('keeps profile as a menu and edits preferences on second-level settings pages', () => {
    for (const route of ['/plugins', '/memory', '/logs', '/rules']) {
      expect(profile).toContain(`router.push('${route}')`)
    }
    for (const section of ['server', 'identity', 'appearance', 'speech']) {
      expect(profile).toContain(`openSetting('${section}')`)
      expect(settings).toContain(`section === '${section}'`)
    }
    expect(profile).toContain("router.push('/legal/index')")
    expect(profile).not.toContain("router.push('/legal/terms')")
    expect(profile).not.toContain("router.push('/legal/privacy')")
    expect(profile).not.toContain('<Slider')
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
