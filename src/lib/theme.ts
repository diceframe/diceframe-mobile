import type { ResolvedTheme, ThemeMode } from '@/stores/settings'
import { useSettingsStore } from '@/stores/settings'

/**
 * React Native Reusables 主题契约。
 * 值与 src/global.css 一一对应；额外语义色供 DiceFrame 徽章和原生控件使用。
 */
export const THEME = {
  light: {
    background: '#e2e5e0',
    foreground: '#201c16',
    card: '#fafbf7',
    cardForeground: '#201c16',
    popover: '#e9ede7',
    popoverForeground: '#201c16',
    primary: '#277f84',
    primaryForeground: '#ffffff',
    secondary: '#dbe1da',
    secondaryForeground: '#201c16',
    muted: '#dbe1da',
    mutedForeground: '#68736f',
    accent: '#ffffff',
    accentForeground: '#201c16',
    destructive: '#9c413e',
    destructiveForeground: '#ffffff',
    success: '#397750',
    successForeground: '#f0f6f1',
    warning: '#9b651f',
    warningForeground: '#fdf7ec',
    info: '#3e7089',
    infoForeground: '#eef5f9',
    gold: '#5f7377',
    goldStrong: '#314a50',
    goldForeground: '#fffaf0',
    border: 'rgba(64,82,70,0.23)',
    input: 'rgba(64,82,70,0.3)',
    ring: '#277f84',
    radius: '14px',
    chart1: '#277f84',
    chart2: '#397750',
    chart3: '#3e7089',
    chart4: '#9b651f',
    chart5: '#9c413e',
  },
  dark: {
    background: '#070b11',
    foreground: '#eef2ec',
    card: '#0e1720',
    cardForeground: '#eef2ec',
    popover: '#121f2b',
    popoverForeground: '#eef2ec',
    primary: '#55b9bd',
    primaryForeground: '#f7fcfc',
    secondary: '#182936',
    secondaryForeground: '#eef2ec',
    muted: '#182936',
    mutedForeground: '#8f9d98',
    accent: '#1d303e',
    accentForeground: '#eef2ec',
    destructive: '#a94f4d',
    destructiveForeground: '#ffffff',
    success: '#4d9169',
    successForeground: '#f0f7f2',
    warning: '#d39a4c',
    warningForeground: '#1f1503',
    info: '#548fad',
    infoForeground: '#f2f8fb',
    gold: '#caa65f',
    goldStrong: '#f0d38b',
    goldForeground: '#14110b',
    border: 'rgba(203,169,94,0.27)',
    input: 'rgba(203,169,94,0.25)',
    ring: '#55b9bd',
    radius: '14px',
    chart1: '#55b9bd',
    chart2: '#4d9169',
    chart3: '#548fad',
    chart4: '#d39a4c',
    chart5: '#a94f4d',
  },
} as const

export const NAV_THEME = {
  light: {
    dark: false,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    dark: true,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
} as const

export type ThemeTokenName = keyof (typeof THEME)['light']

export function readThemeToken(token: ThemeTokenName, theme: ResolvedTheme): string {
  return THEME[theme][token]
}

export function resolveTheme(themeMode: ThemeMode, systemTheme: ResolvedTheme): ResolvedTheme {
  return themeMode === 'system' ? systemTheme : themeMode
}

export function useResolvedTheme(): ResolvedTheme {
  const themeMode = useSettingsStore((state) => state.themeMode)
  const systemTheme = useSettingsStore((state) => state.systemTheme)
  return resolveTheme(themeMode, systemTheme)
}

export function useThemeToken(token: ThemeTokenName): string {
  return readThemeToken(token, useResolvedTheme())
}
