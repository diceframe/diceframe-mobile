import * as React from 'react'
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

import {
  capsuleFill,
  capsuleRim,
  capsuleSpecular,
  glassBackdropPalette,
  glassHighlight,
  glassTint,
} from '@/lib/glass'
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
 * 贴底标签栏背景：背景画布的下沿一段 + 淡染色 + 镜面高光。标签栏占位不叠在内容上，
 * 背后只有环境光，不需要实时模糊。
 */
export function GlassBarBackground({ theme, anchor = 'bottom' }: { theme: ResolvedTheme; anchor?: 'top' | 'bottom' }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]}>
      <GlassBackdrop theme={theme} anchor={anchor} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: glassTint(theme) }]} />
      <LinearGradient colors={capsuleSpecular(theme)} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.7 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.highlight, { backgroundColor: glassHighlight(theme) }]} />
    </View>
  )
}

/**
 * 自绘悬浮胶囊 / 悬浮侧栏的玻璃面（Android 手机胶囊走 react-native-liquid-tabs，不经过这里）：
 * 填充 + 顶部镜面高光渐变 + 内描边。投影在外层 tabBarStyle 上（这里裁圆角，阴影画在里面会被裁掉）。
 * 胶囊浮在页面内容上方，不再拼背景画布——底下滑过的就是真实内容：Web 用 CSS 模糊，
 * 原生没有模糊，填充接近不透明（见 capsuleFill）。
 */
export function GlassCapsuleBackground({ theme, radius, overContent }: {
  theme: ResolvedTheme
  radius: number
  /** 是否浮在会滚动的内容上方（手机胶囊是，平板侧栏不是——背后只有环境光，淡染色即可） */
  overContent: boolean
}) {
  const material = !overContent ? 'ambient' : Platform.OS === 'web' ? 'blur' : 'tint'
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: capsuleFill(theme, material) },
          // react-native-web 原样输出为 CSS backdrop-filter
          material === 'blur' ? ({ backdropFilter: 'blur(24px) saturate(160%)' } as object) : null,
        ]}
      />
      <LinearGradient colors={capsuleSpecular(theme)} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.6 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: capsuleRim(theme) }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', left: 0 },
  clip: { overflow: 'hidden' },
  highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth },
})
