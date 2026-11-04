import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  capsuleFill,
  capsuleRim,
  capsuleShadow,
  capsuleSpecular,
  floatingTabBarGeometry,
  glassBackdropPalette,
  glassCssVars,
  glassHighlight,
  glassTint,
  isGlassActive,
  shouldUseNativeGlass,
  surfaceCssVars,
  withAlpha,
} from './glass'
import { THEME } from './theme'

// vitest 把 vi.mock 提升到文件顶部，实际先于上面的 import 执行。
// theme.ts 经 settings store 引入 RN 模块；这里只测纯函数，换成最小桩
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }))
vi.mock('react-native', () => ({ Appearance: { getColorScheme: () => 'dark' }, Platform: { OS: 'android' } }))

const RGBA = /^rgba\((\d+),(\d+),(\d+),(0|1|0\.\d+)\)$/

function alphaOf(color: string): number {
  const match = RGBA.exec(color)
  if (!match) throw new Error(`not rgba: ${color}`)
  return Number(match[4])
}

describe('withAlpha', () => {
  it('六位与三位 hex、rgba 输入都换成指定透明度，色值不变', () => {
    expect(withAlpha('#277f84', 0.5)).toBe('rgba(39,127,132,0.5)')
    expect(withAlpha('#fff', 0.25)).toBe('rgba(255,255,255,0.25)')
    expect(withAlpha('rgba(64,82,70,0.23)', 0.8)).toBe('rgba(64,82,70,0.8)')
    expect(withAlpha('rgb(1, 2, 3)', 1)).toBe('rgba(1,2,3,1)')
  })

  it('透明度夹在 0–1，认不出的颜色直接报错而不是静默给错色', () => {
    expect(withAlpha('#000000', 2)).toBe('rgba(0,0,0,1)')
    expect(withAlpha('#000000', -1)).toBe('rgba(0,0,0,0)')
    expect(() => withAlpha('teal', 0.5)).toThrow()
  })
})

describe('glassCssVars', () => {
  const css = readFileSync(resolve(__dirname, '../global.css'), 'utf8')

  it.each(['light', 'dark'] as const)('%s：只覆盖 global.css 里真实存在的变量，且都是半透明 rgba', (theme) => {
    const vars = glassCssVars(theme)
    for (const [name, value] of Object.entries(vars)) {
      expect(css).toContain(`${name}:`)
      const alpha = alphaOf(value)
      expect(alpha).toBeGreaterThan(0)
      expect(alpha).toBeLessThan(1)
    }
  })

  it.each(['light', 'dark'] as const)('%s：不覆盖 --background（滑块、对话框、场景遮罩要靠它保持不透明）', (theme) => {
    expect(glassCssVars(theme)).not.toHaveProperty('--background')
    expect(glassCssVars(theme)).not.toHaveProperty('--foreground')
  })

  it.each(['light', 'dark'] as const)('%s：抽屉用的 popover 接近不透明，明显高于卡片', (theme) => {
    const vars = glassCssVars(theme)
    // 没有实时模糊时 6% 的透出就能看到后面页面的字影（SHV41 实测）
    expect(alphaOf(vars['--popover'])).toBeGreaterThanOrEqual(0.98)
    expect(alphaOf(vars['--card'])).toBeLessThan(alphaOf(vars['--popover']) - 0.2)
  })

  it('卡片保持主题原色相，只改透明度', () => {
    expect(glassCssVars('light')['--card']).toBe(withAlpha(THEME.light.card, alphaOf(glassCssVars('light')['--card'])))
    expect(glassCssVars('dark')['--card']).toBe(withAlpha(THEME.dark.card, alphaOf(glassCssVars('dark')['--card'])))
  })

  it('标签栏高光与 --border 覆盖值一致；标签栏染色比卡片更淡', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(glassHighlight(theme)).toBe(glassCssVars(theme)['--border'])
      expect(alphaOf(glassTint(theme))).toBeLessThan(alphaOf(glassCssVars(theme)['--card']))
    }
  })
})

describe('surfaceCssVars', () => {
  const css = readFileSync(resolve(__dirname, '../global.css'), 'utf8')
  const blockOf = (selector: string) => css.slice(css.indexOf(selector)).split('}')[0]
  const compact = (value: string | undefined) => value?.replace(/\s+/g, '')
  const cssValue = (block: string, name: string) => compact(new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1])

  it.each([['light', ':root {'], ['dark', '.dark:root {']] as const)('%s 经典风格：与 global.css 原值一致（挂上去不改变经典外观）', (theme, selector) => {
    const block = blockOf(selector)
    for (const [name, value] of Object.entries(surfaceCssVars(theme, false))) {
      expect(compact(value)).toBe(cssValue(block, name))
    }
  })

  it.each(['light', 'dark'] as const)('%s：两种风格覆盖同一组变量名（NativeWind 变量集合变化会重挂整棵树）', (theme) => {
    expect(Object.keys(surfaceCssVars(theme, false)).sort()).toEqual(Object.keys(surfaceCssVars(theme, true)).sort())
    expect(surfaceCssVars(theme, true)).toEqual(glassCssVars(theme))
  })
})

describe('glassBackdropPalette', () => {
  it.each(['light', 'dark'] as const)('%s：颜色全部取自主题令牌，光团落在画布内', (theme) => {
    const palette = glassBackdropPalette(theme)
    const tokens = new Set<string>(Object.values(THEME[theme]))
    for (const color of [...palette.base, ...palette.glows.map((glow) => glow.color)]) expect(tokens).toContain(color)
    for (const glow of palette.glows) {
      expect(glow.cx).toBeGreaterThanOrEqual(0)
      expect(glow.cx).toBeLessThanOrEqual(1)
      expect(glow.cy).toBeGreaterThanOrEqual(0)
      expect(glow.cy).toBeLessThanOrEqual(1)
      expect(glow.opacity).toBeGreaterThan(0)
      expect(glow.opacity).toBeLessThan(0.5)
    }
  })
})

describe('悬浮胶囊标签栏', () => {
  it('药丸形：圆角是高度一半；底边距叠在系统安全区上；内容留白覆盖胶囊与底边距', () => {
    const g = floatingTabBarGeometry(34)
    expect(g.radius).toBe(g.height / 2)
    expect(g.bottom).toBeGreaterThan(34)
    expect(g.side).toBeGreaterThan(0)
    expect(g.overlap).toBeGreaterThan(g.height + g.bottom)
    expect(floatingTabBarGeometry(-5).bottom).toBe(floatingTabBarGeometry(0).bottom)
  })

  it.each(['light', 'dark'] as const)('%s：没有模糊时填充接近不透明，有模糊 / 原生折射时更通透', (theme) => {
    const tint = alphaOf(capsuleFill(theme, 'tint'))
    const blur = alphaOf(capsuleFill(theme, 'blur'))
    const native = alphaOf(capsuleFill(theme, 'native'))
    expect(tint).toBeGreaterThanOrEqual(0.92)
    expect(blur).toBeLessThan(tint)
    expect(native).toBeLessThan(blur)
  })

  it.each(['light', 'dark'] as const)('%s：镜面高光从可见渐隐到全透明，描边与投影都是主题色加透明度', (theme) => {
    const [from, to] = capsuleSpecular(theme)
    expect(alphaOf(from)).toBeGreaterThan(0)
    expect(alphaOf(to)).toBe(0)
    expect(alphaOf(capsuleRim(theme))).toBeGreaterThan(0)
    expect(capsuleShadow(theme)).toMatch(/^0px \d+px \d+px rgba\(\d+,\d+,\d+,0\.\d+\)$/)
  })
})

describe('shouldUseNativeGlass', () => {
  it('Android 只在 13+ 折射档挂原生玻璃；低版本（每帧截整窗会白屏）与 Web 用自绘染色', () => {
    expect(shouldUseNativeGlass('refraction', 'android')).toBe(true)
    expect(shouldUseNativeGlass('blur', 'android')).toBe(false)
    expect(shouldUseNativeGlass('tint', 'android')).toBe(false)
    expect(shouldUseNativeGlass('none', 'web')).toBe(false)
  })

  it('iOS 走系统材质不截图：26 的玻璃与更老版本的模糊都可以用', () => {
    expect(shouldUseNativeGlass('glass', 'ios')).toBe(true)
    expect(shouldUseNativeGlass('blur', 'ios')).toBe(true)
  })
})

describe('isGlassActive', () => {
  it('只有选了液态玻璃且系统没要求降低透明度时才启用', () => {
    expect(isGlassActive('glass', false)).toBe(true)
    expect(isGlassActive('glass', true)).toBe(false)
    expect(isGlassActive('classic', false)).toBe(false)
    expect(isGlassActive('classic', true)).toBe(false)
  })
})
