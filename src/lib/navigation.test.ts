import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const tabs = source('../app/(tabs)/_layout.tsx')
const profile = source('../app/(tabs)/profile.tsx')
const play = source('../features/play/GameScreen.tsx')
const gmPanel = source('../features/play/GmPanelSheet.tsx')

function routeSource(relativePath: string) {
  return source(`../app/(profile)/settings/${relativePath}`)
}

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
      '(profile)/settings/index.tsx',
      '(profile)/settings/server.tsx',
      '(profile)/settings/identity.tsx',
      '(profile)/settings/appearance.tsx',
      '(profile)/settings/language.tsx',
      '(profile)/settings/speech.tsx',
      '(profile)/settings/haptics.tsx',
      '(profile)/settings/updates.tsx',
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
    // settings.tsx 与 settings/index.tsx 会争抢 /settings 路由，旧单文件必须移除
    expect(existsSync(fileURLToPath(new URL('(profile)/settings.tsx', appUrl)))).toBe(false)
  })

  it('keeps profile as a menu and edits preferences on second-level settings pages', () => {
    for (const route of ['/plugins', '/memory', '/logs', '/rules']) {
      expect(profile).toContain(`router.push('${route}')`)
    }
    for (const section of ['server', 'identity', 'appearance', 'speech']) {
      expect(profile).toContain(`openSetting('${section}')`)
      // 每个设置项都是 settings/ 下的子路由，由共享外壳统一 PageHeader 与限宽布局
      expect(routeSource(`${section}.tsx`)).toContain(`section="${section}"`)
    }
    expect(profile).toContain('router.push(`/settings/${section}`)')
    // typedRoutes 开启后 legal/index.tsx 的规范 href 是 /legal（/legal/index 不在类型联合里）
    expect(profile).toContain("router.push('/legal')")
    expect(profile).not.toContain("router.push('/legal/terms')")
    expect(profile).not.toContain("router.push('/legal/privacy')")
    expect(profile).not.toContain('<Slider')
    expect(profile).not.toContain("router.push('/peer')")
  })

  it('keeps play route a thin shell over the feature screen', () => {
    const shell = source('../app/play/[gameKey].tsx')
    expect(shell).toContain("export { default } from '@/features/play/GameScreen'")
  })

  it('separates play context from GM management', () => {
    expect(play).toContain('情境入口')
    expect(play).toContain('gmRoundControls')
    expect(play).toContain('GM 桌面管理抽屉')
    expect(gmPanel).toContain('GM 桌面管理抽屉')
    expect(gmPanel).toContain('value="players"')
    expect(gmPanel).toContain('value="health"')
  })
})
