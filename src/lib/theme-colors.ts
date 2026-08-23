import { useColorScheme } from 'react-native'

/**
 * RefreshControl / TabBar 等原生组件需要 JS 侧颜色值（NativeWind 变量不可直接读取）。
 * 值与 src/global.css 对应令牌同步（来源 Web tokens.css，暗=midnight / 亮=light）。
 */
const TOKENS = {
  gold: { dark: '#caa65f', light: '#5f7377' },
  mutedForeground: { dark: '#8f9d98', light: '#68736f' },
  foreground: { dark: '#eef2ec', light: '#201c16' },
  card: { dark: '#0e1720', light: '#fafbf7' },
  background: { dark: '#070b11', light: '#e2e5e0' },
  border: { dark: 'rgba(203,169,94,0.27)', light: 'rgba(64,82,70,0.23)' },
} as const

export type ThemeTokenName = keyof typeof TOKENS

export function useThemeToken(token: ThemeTokenName): string {
  const scheme = useColorScheme()
  return scheme === 'light' ? TOKENS[token].light : TOKENS[token].dark
}
