import * as React from 'react'
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'
import { getGlassCapabilities, LiquidGlassView } from 'react-native-liquid-glassmorphism'

import { glassBackdropPalette, glassHighlight, glassTint, shouldUseNativeGlass } from '@/lib/glass'
import type { ResolvedTheme } from '@/stores/settings'

let gradientSeq = 0

/**
 * 液态玻璃风格的环境光背景。画布固定为整个窗口大小并贴着窗口的上沿或下沿：
 * 页面（Screen）贴上沿画、标签栏贴下沿画，两段拼起来是同一张画布，接缝处颜色连续。
 * 只做装饰，不接收触摸。
 */
export function GlassBackdrop({ theme, anchor = 'top' }: { theme: ResolvedTheme; anchor?: 'top' | 'bottom' }) {
  const { width, height } = useWindowDimensions()
  const palette = glassBackdropPalette(theme)
  // 多个背景同屏（页面 + 标签栏）时 SVG 渐变 id 不能撞（Web 上 id 是全局的）
  const [prefix] = React.useState(() => `df-glass-glow-${(gradientSeq += 1)}`)
  return (
    <View
      pointerEvents="none"
      style={[styles.canvas, { width, height }, anchor === 'top' ? { top: 0 } : { bottom: 0 }]}
    >
      <LinearGradient
        colors={palette.base}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {palette.glows.map((glow, index) => (
            <RadialGradient key={index} id={`${prefix}-${index}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow.color} stopOpacity={glow.opacity} />
              <Stop offset="1" stopColor={glow.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {palette.glows.map((glow, index) => (
          <Circle
            key={index}
            cx={glow.cx * width}
            cy={glow.cy * height}
            r={glow.r * width}
            fill={`url(#${prefix}-${index})`}
          />
        ))}
      </Svg>
    </View>
  )
}

/**
 * 标签栏背景：背景画布的下沿一段 + 玻璃层。Android 13+ 用库的 AGSL 实时折射、iOS 用系统材质；
 * 其余平台（低版本 Android、Web）用半透明染色，原因见 lib/glass 的 shouldUseNativeGlass。
 */
export function GlassBarBackground({ theme, anchor = 'bottom' }: { theme: ResolvedTheme; anchor?: 'top' | 'bottom' }) {
  const native = shouldUseNativeGlass(getGlassCapabilities().tier, Platform.OS)
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]}>
      <GlassBackdrop theme={theme} anchor={anchor} />
      {native ? (
        <LiquidGlassView
          style={StyleSheet.absoluteFill}
          variant="regular"
          tintColor={glassTint(theme)}
          intensity={65}
          borderRadius={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glassTint(theme) }]} />
      )}
      <View style={[styles.highlight, { backgroundColor: glassHighlight(theme) }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', left: 0 },
  clip: { overflow: 'hidden' },
  highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth },
})
