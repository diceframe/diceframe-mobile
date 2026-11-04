import type { ResolvedTheme, UiStyle } from '@/stores/settings'

import { THEME } from './theme'

/**
 * 液态玻璃界面风格（与明暗主题正交）：
 * - 表面令牌换成半透明版本，经 NativeWind vars() 挂在根节点上覆盖 global.css 的同名变量，
 *   rnr 生成的 ui/ 组件不用改就跟着变；
 * - 页面底下铺一层环境光背景（GlassBackdrop），半透明表面才透得出颜色；
 * - 标签栏用 react-native-liquid-glassmorphism 的实时折射（Android 13+ / iOS 26），
 *   更老的系统由库自己降级为染色 + 描边。
 *
 * --background 刻意不动：开关滑块、对话框、对局场景遮罩都靠它保持不透明。
 * 没有实时模糊的平台上，抽屉这类叠在内容上方的面板必须接近不透明，所以 popover 只降一点。
 */

/** 只覆盖这些表面令牌；值都是 THEME 里同名色加透明度，色相不变 */
type SurfaceToken = 'card' | 'popover' | 'secondary' | 'muted' | 'accent'

// popover 给抽屉 / 下拉用：它们叠在文字上方，没有模糊时 6% 的透出（SHV41 实测）就能看到
// 后面页面的字影，所以只留一点点透明度
const SURFACE_ALPHA: Record<ResolvedTheme, Record<SurfaceToken, number>> = {
  light: { card: 0.62, popover: 0.985, secondary: 0.5, muted: 0.45, accent: 0.66 },
  dark: { card: 0.55, popover: 0.98, secondary: 0.45, muted: 0.4, accent: 0.5 },
}

/** #rgb / #rrggbb → rgba(r,g,b,a)；rgba() 输入按新透明度改写 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (rgba) return `rgba(${rgba[1]},${rgba[2]},${rgba[3]},${a})`
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)
  if (!hex) throw new Error(`withAlpha: unsupported color ${color}`)
  const digits = hex[1].length === 3 ? hex[1].replace(/./g, (d) => d + d) : hex[1]
  const r = parseInt(digits.slice(0, 2), 16)
  const g = parseInt(digits.slice(2, 4), 16)
  const b = parseInt(digits.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/**
 * 玻璃风格下覆盖的 CSS 变量。边框换成高光：亮色用白色（accent），暗色用前景色低透明度，
 * 让卡片边缘像玻璃的反光而不是描线。
 */
export function glassCssVars(theme: ResolvedTheme): Record<`--${string}`, string> {
  const t = THEME[theme]
  const alpha = SURFACE_ALPHA[theme]
  return {
    '--card': withAlpha(t.card, alpha.card),
    '--popover': withAlpha(t.popover, alpha.popover),
    '--secondary': withAlpha(t.secondary, alpha.secondary),
    '--muted': withAlpha(t.muted, alpha.muted),
    '--accent': withAlpha(t.accent, alpha.accent),
    '--border': theme === 'light' ? withAlpha(t.accent, 0.72) : withAlpha(t.foreground, 0.14),
  }
}

/**
 * 根节点上的表面变量：两种风格覆盖同一组变量名，经典风格给主题原值（与 global.css 一致）。
 * NativeWind 要求变量在首次渲染就存在，否则之后加上变量会让整棵子树重新挂载
 * （切换风格会丢掉页面滚动位置、输入草稿等本地状态），所以经典风格也必须挂这一组。
 */
export function surfaceCssVars(theme: ResolvedTheme, glass: boolean): Record<`--${string}`, string> {
  if (glass) return glassCssVars(theme)
  const t = THEME[theme]
  return {
    '--card': t.card,
    '--popover': t.popover,
    '--secondary': t.secondary,
    '--muted': t.muted,
    '--accent': t.accent,
    '--border': t.border,
  }
}

/** 标签栏等原生玻璃的染色：比卡片再淡一些，让折射出来的背景看得见 */
export function glassTint(theme: ResolvedTheme): string {
  return withAlpha(THEME[theme].card, theme === 'light' ? 0.35 : 0.3)
}

/** 玻璃高光描边色（与 --border 覆盖值一致，供原生 style 使用） */
export function glassHighlight(theme: ResolvedTheme): string {
  return glassCssVars(theme)['--border']
}

export interface GlassGlow {
  color: string
  /** 圆心位置，相对画布宽高的 0–1 */
  cx: number
  cy: number
  /** 半径，相对画布宽度 */
  r: number
  opacity: number
}

export interface GlassBackdropPalette {
  /** 底色渐变（左上 → 右下） */
  base: readonly [string, string, string]
  glows: readonly GlassGlow[]
}

/**
 * 环境光背景：主题底色上叠三团柔光（主色青、金、信息蓝），与 Web 同一色族。
 * 光团位置避开屏幕正中，正文区域底色相对平稳，半透明卡片上的字不至于花。
 */
export function glassBackdropPalette(theme: ResolvedTheme): GlassBackdropPalette {
  const t = THEME[theme]
  if (theme === 'light') {
    return {
      base: [t.background, t.card, t.secondary],
      glows: [
        { color: t.primary, cx: 0.08, cy: 0.1, r: 0.75, opacity: 0.4 },
        // 浅色主题的 gold 是灰青色，暖色光团改用 warning（琥珀）
        { color: t.warning, cx: 0.95, cy: 0.45, r: 0.7, opacity: 0.2 },
        { color: t.info, cx: 0.2, cy: 0.92, r: 0.8, opacity: 0.34 },
      ],
    }
  }
  return {
    base: [t.background, t.card, t.background],
    glows: [
      { color: t.primary, cx: 0.1, cy: 0.08, r: 0.8, opacity: 0.42 },
      { color: t.gold, cx: 0.98, cy: 0.5, r: 0.65, opacity: 0.26 },
      { color: t.info, cx: 0.15, cy: 0.95, r: 0.85, opacity: 0.38 },
    ],
  }
}

/** react-native-liquid-glassmorphism 的设备能力档（与库的 GlassTier 一致） */
export type NativeGlassTier = 'glass' | 'refraction' | 'blur' | 'tint' | 'none'

/**
 * 是否挂原生液态玻璃。库在 Android 上每帧把整个根视图软件绘制一遍来截背景；
 * 在 API 28（SHV41 实测）上这会把整窗画成空白，而这些低版本只有「染色 + 描边」档，
 * 截图毫无用处。所以 Android 只在 13+ 的折射档用它，iOS 走系统材质（不截图）不受影响；
 * 其余情况用我们自己的半透明染色，观感与库的低档位一致。
 */
export function shouldUseNativeGlass(tier: NativeGlassTier, os: string): boolean {
  if (tier === 'glass' || tier === 'refraction') return true
  return os === 'ios' && tier === 'blur'
}

/** 系统要求降低透明度（iOS「降低透明度」）时一律回到经典风格 */
export function isGlassActive(uiStyle: UiStyle, reduceTransparency: boolean): boolean {
  return uiStyle === 'glass' && !reduceTransparency
}
