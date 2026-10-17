import * as React from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg'

import { Text } from '@/components/ui/text'
import type { AvatarMood } from '@/lib/assistant-reactions'
import {
  FAMILIAR_POSES,
  IDLE_GESTURES,
  idleGestureHands,
  type BodyMotion,
  type EyePose,
  type HandPose,
} from '@/lib/familiar-poses'
import { THEME, useThemeToken } from '@/lib/theme'

/*
 * 骰灵（对齐上游 PR #549 AssistantAvatar）：液态玻璃 d20，正面是深色面罩，眼睛会眨、会四处张望、
 * 随表情变形；两只悬浮玻璃小手跟着比划，待机时偶尔挥手 / 伸懒腰 / 挠头。纯表现，表情由宿主决定。
 * 上游 Web 的液态折射滤镜在原生上没有对应能力，这里用渐变玻璃 + 高光近似。
 */

const HEX = 'M57.808 7.476 L83.192 22.024 Q91 26.5 91 35.5 L91 64.5 Q91 73.5 83.192 77.976 L57.808 92.524 Q50 97 42.192 92.524 L16.808 77.976 Q9 73.5 9 64.5 L9 35.5 Q9 26.5 16.808 22.024 L42.192 7.476 Q50 3 57.808 7.476Z'
/** 正面三角刻面（面罩）：与 FACETS 的内三角一致，圆角收边 */
const VISOR = 'M53.5 27.6 L80.5 66.4 Q83 71 78 71 L22 71 Q17 71 19.5 66.4 L46.5 27.6 Q50 22.6 53.5 27.6Z'
const FACETS = [
  [50, 22, 50, 3], [50, 22, 91, 26.5], [50, 22, 9, 26.5],
  [83, 71, 91, 26.5], [83, 71, 91, 73.5], [83, 71, 50, 97],
  [17, 71, 50, 97], [17, 71, 9, 73.5], [17, 71, 9, 26.5],
] as const
/** 面罩里的眼睛中心（viewBox 单位） */
const EYE_CENTER_Y = 54
const EYE_GAP = 13
/** 上游的面罩与眼睛是固定的深色 / 亮白，不随主题切换（玻璃壳才跟主题色） */
const VISOR_FILL = THEME.dark.background
const EYE_COLOR = '#f4fbff'

let gradientSeq = 0

function Eye({ pose, side, size, blink, look }: {
  pose: EyePose
  side: 0 | 1
  size: number
  blink: boolean
  look: [number, number]
}) {
  const unit = size / 100
  const height = pose.h * (side === 1 ? pose.rightScale ?? 1 : 1)
  const offsetX = (side === 0 ? -1 : 1) * (EYE_GAP / 2 + pose.w / 2) * 0.55
  const lookX = (pose.look?.[0] ?? 0) + look[0]
  const lookY = (pose.look?.[1] ?? 0) + look[1]
  const animated = useAnimatedStyle(() => ({
    width: withTiming(pose.w * unit, { duration: 220 }),
    height: withTiming(height * unit, { duration: 220 }),
    transform: [
      { translateX: withTiming((offsetX + lookX) * unit, { duration: 280 }) },
      { translateY: withTiming(lookY * unit, { duration: 280 }) },
      { rotate: withTiming(`${pose.rotate[side]}deg`, { duration: 180 }) },
      { scaleY: withTiming(blink && pose.kind === 'pill' ? 0.12 : 1, { duration: 80 }) },
    ],
  }))
  const base = {
    position: 'absolute' as const,
    left: 50 * unit,
    top: EYE_CENTER_Y * unit,
    marginLeft: (-pose.w * unit) / 2,
    marginTop: (-height * unit) / 2,
  }

  if (pose.kind === 'cross') {
    const bar = { position: 'absolute' as const, left: 0, right: 0, top: '42%' as const, height: '16%' as const, backgroundColor: EYE_COLOR, borderRadius: 2 }
    return (
      <Animated.View style={[base, animated]}>
        <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
        <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
      </Animated.View>
    )
  }
  if (pose.kind === 'chevron') {
    return (
      <Animated.View
        style={[base, animated, { borderTopWidth: 2.2 * unit, borderRightWidth: 2.2 * unit, borderColor: EYE_COLOR, borderRadius: unit }]}
      />
    )
  }
  const radius = pose.kind === 'sparkle' ? unit : 999
  return (
    <Animated.View
      style={[
        base,
        animated,
        pose.kind === 'arc'
          ? { borderTopLeftRadius: 999, borderTopRightRadius: 999, borderTopWidth: 2.4 * unit, borderLeftWidth: 2.4 * unit, borderRightWidth: 2.4 * unit, borderColor: EYE_COLOR }
          : { backgroundColor: EYE_COLOR, borderRadius: radius },
      ]}
    />
  )
}

function Hand({ pose, size, glow, children }: { pose: HandPose; size: number; glow: string; children?: React.ReactNode }) {
  const unit = size / 100
  const hand = 22 * unit
  const animated = useAnimatedStyle(() => ({
    opacity: withTiming(pose.visible ? 1 : 0, { duration: 220 }),
    transform: [
      { translateX: withSpring(pose.x * unit, { damping: 12, stiffness: 160 }) },
      { translateY: withSpring(pose.y * unit, { damping: 12, stiffness: 160 }) },
      { rotate: withTiming(`${pose.rotate}deg`, { duration: 300 }) },
      { scale: withTiming(pose.visible ? 1 : 0.6, { duration: 260 }) },
    ],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 50 * unit - hand / 2,
          top: 50 * unit - hand / 2,
          width: hand,
          height: hand * 0.86,
          borderRadius: hand,
          borderWidth: Math.max(1, unit),
          borderColor: 'rgba(255,255,255,0.65)',
          backgroundColor: glow,
          opacity: 0,
        },
        animated,
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** 身体动作：一次性（打滚 / 蹦 / 晃 / 缩）或循环（倾身 / 张望 / 轻摆） */
function useBodyMotion(motion: BodyMotion, reduceMotion: boolean) {
  const rotate = useSharedValue(0)
  const lift = useSharedValue(0)
  const shift = useSharedValue(0)
  React.useEffect(() => {
    cancelAnimation(rotate)
    cancelAnimation(lift)
    cancelAnimation(shift)
    rotate.set(0)
    lift.set(0)
    shift.set(0)
    if (reduceMotion) return
    const ease = Easing.inOut(Easing.quad)
    if (motion === 'roll') rotate.set(withTiming(360, { duration: 900, easing: Easing.out(Easing.back(1.4)) }))
    if (motion === 'hop' || motion === 'hop2') {
      const hop = withSequence(withTiming(-10, { duration: 180, easing: ease }), withTiming(0, { duration: 260, easing: Easing.bounce }))
      lift.set(motion === 'hop' ? hop : withRepeat(hop, 2, false))
    }
    if (motion === 'wobble') rotate.set(withRepeat(withSequence(withTiming(-12, { duration: 220 }), withTiming(12, { duration: 440 }), withTiming(0, { duration: 220 })), 2, false))
    if (motion === 'flinch') shift.set(withSequence(withTiming(-6, { duration: 60 }), withTiming(5, { duration: 80 }), withTiming(-3, { duration: 80 }), withTiming(0, { duration: 120 })))
    if (motion === 'lean') rotate.set(withRepeat(withTiming(7, { duration: 450, easing: ease }), -1, true))
    if (motion === 'dart') shift.set(withRepeat(withSequence(withTiming(-3, { duration: 280 }), withDelay(200, withTiming(3, { duration: 280 }))), -1, true))
    if (motion === 'bob') lift.set(withRepeat(withTiming(-2.5, { duration: 700, easing: ease }), -1, true))
    return () => {
      cancelAnimation(rotate)
      cancelAnimation(lift)
      cancelAnimation(shift)
    }
  }, [motion, reduceMotion, rotate, lift, shift])
  return { rotate, lift, shift }
}

export function DiceFamiliar({ mood = 'idle', size = 56, hands = true }: { mood?: AvatarMood; size?: number; hands?: boolean }) {
  const glow = useThemeToken('primary')
  const warm = useThemeToken('goldStrong')
  const warning = useThemeToken('warning')
  const reduceMotion = useReducedMotion()
  const [ids] = React.useState(() => {
    gradientSeq += 1
    return { glass: `df-familiar-glass-${gradientSeq}`, rim: `df-familiar-rim-${gradientSeq}` }
  })
  const [blink, setBlink] = React.useState(false)
  const [look, setLook] = React.useState<[number, number]>([0, 0])
  const [gesture, setGesture] = React.useState<(typeof IDLE_GESTURES)[number] | null>(null)

  const pose = FAMILIAR_POSES[mood]
  const { rotate, lift, shift } = useBodyMotion(pose.body.motion, reduceMotion)

  // 眨眼、张望、待机小动作：随机间隔，与上游节奏一致；减少动态效果时全部关闭
  React.useEffect(() => {
    if (reduceMotion) return
    const timers: ReturnType<typeof setTimeout>[] = []
    let alive = true
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(() => { if (alive) fn() }, ms)) }
    const scheduleBlink = () => later(() => {
      setBlink(true)
      later(() => {
        setBlink(false)
        if (Math.random() < 0.22) later(() => { setBlink(true); later(() => setBlink(false), 110) }, 140)
      }, 120)
      scheduleBlink()
    }, 2600 + Math.random() * 3600)
    const scheduleGlance = () => later(() => {
      const angle = Math.random() * Math.PI * 2
      const reach = Math.random() < 0.35 ? 0 : 0.5 + Math.random() * 0.5
      setLook([Math.cos(angle) * reach * 3.4, Math.sin(angle) * reach * 3.4 * 0.7])
      scheduleGlance()
    }, 3200 + Math.random() * 3000)
    const scheduleGesture = () => later(() => {
      setGesture(IDLE_GESTURES[Math.floor(Math.random() * IDLE_GESTURES.length)])
      later(() => setGesture(null), 1800)
      scheduleGesture()
    }, 14000 + Math.random() * 16000)
    scheduleBlink()
    scheduleGlance()
    if (hands) scheduleGesture()
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [reduceMotion, hands])

  const unit = size / 100
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shift.get() * unit },
      { translateY: (pose.body.translateY + lift.get()) * unit },
      { rotate: `${pose.body.rotate + rotate.get()}deg` },
      { scale: withSpring(pose.body.scale, { damping: 10, stiffness: 180 }) },
    ],
  }))
  const handPoses = mood === 'idle' && gesture ? idleGestureHands(gesture) : pose.hands
  const handFill = `${glow}55`

  return (
    <View style={{ width: size, height: size }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={ids.glass} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.45} />
              <Stop offset="0.45" stopColor={glow} stopOpacity={0.35} />
              <Stop offset="1" stopColor={glow} stopOpacity={0.6} />
            </LinearGradient>
            <LinearGradient id={ids.rim} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
              <Stop offset="0.38" stopColor="#ffffff" stopOpacity={0.1} />
              <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0.05} />
              <Stop offset="1" stopColor={glow} stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          <Path d={HEX} fill="#000000" opacity={0.18} transform="translate(2 4)" />
          <Path d={HEX} fill={`url(#${ids.glass})`} />
          <G stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1.2}>
            {FACETS.map((line, index) => (
              <Line key={index} x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} />
            ))}
          </G>
          <Path d={VISOR} fill={VISOR_FILL} fillOpacity={0.92} />
          <Path d={HEX} fill="none" stroke={`url(#${ids.rim})`} strokeWidth={2.4} />
          {/* 左上高光 */}
          <Path d="M30 20 Q40 13 50 11" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </Svg>
        <Eye pose={pose.eyes} side={0} size={size} blink={blink} look={look} />
        <Eye pose={pose.eyes} side={1} size={size} blink={blink} look={look} />
      </Animated.View>

      {hands ? (
        <>
          <Hand pose={handPoses[0]} size={size} glow={handFill} />
          <Hand pose={handPoses[1]} size={size} glow={handFill}>
            {pose.shaking ? <ShakingDie size={size} color={warm} reduceMotion={reduceMotion} /> : null}
          </Hand>
        </>
      ) : null}

      {pose.sparks && !reduceMotion ? <Sparks size={size} color={warm} /> : null}
      {pose.badge ? (
        <View
          style={{
            position: 'absolute', right: size * 0.04, top: size * 0.04,
            width: size * 0.2, height: size * 0.2, borderRadius: size,
            backgroundColor: warning, borderWidth: Math.max(1.5, size * 0.03), borderColor: THEME.dark.background,
          }}
        />
      ) : null}
    </View>
  )
}

/** 掷骰时右手里摇的小骰子 */
function ShakingDie({ size, color, reduceMotion }: { size: number; color: string; reduceMotion: boolean }) {
  const shake = useSharedValue(0)
  React.useEffect(() => {
    if (reduceMotion) return
    shake.set(withRepeat(withSequence(withTiming(-18, { duration: 90 }), withTiming(18, { duration: 180 }), withTiming(0, { duration: 90 })), -1, false))
    return () => cancelAnimation(shake)
  }, [reduceMotion, shake])
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.get()}deg` }] }))
  const die = size * 0.12
  return (
    <Animated.View
      style={[{ position: 'absolute', right: -die * 0.3, top: -die * 0.5, width: die, height: die, borderRadius: die * 0.2, backgroundColor: color }, style]}
    />
  )
}

/** 欢呼时从骰灵身上飞出的三颗星 */
function Sparks({ size, color }: { size: number; color: string }) {
  const progress = useSharedValue(0)
  React.useEffect(() => {
    progress.set(0)
    progress.set(withDelay(350, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) })))
    return () => cancelAnimation(progress)
  }, [progress])
  const targets: [number, number, string][] = [[-70, -55, '✦'], [62, -62, '✦'], [8, -88, '✧']]
  return (
    <>
      {targets.map(([x, y, glyph], index) => (
        <Spark key={index} progress={progress} x={x} y={y} glyph={glyph} size={size} color={color} />
      ))}
    </>
  )
}

function Spark({ progress, x, y, glyph, size, color }: {
  progress: ReturnType<typeof useSharedValue<number>>
  x: number
  y: number
  glyph: string
  size: number
  color: string
}) {
  const unit = size / 100
  const style = useAnimatedStyle(() => {
    const p = progress.get()
    return {
      opacity: p <= 0 ? 0 : p < 0.2 ? p * 5 : 1 - (p - 0.2) / 0.8,
      transform: [{ translateX: x * unit * p }, { translateY: y * unit * p }, { scale: 0.6 + p * 0.6 }],
    }
  })
  return (
    <Animated.View style={[{ position: 'absolute', left: size * 0.42, top: size * 0.35 }, style]}>
      <Text style={{ color, fontSize: size * 0.2 }}>{glyph}</Text>
    </Animated.View>
  )
}
