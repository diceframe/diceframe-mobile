/**
 * 对局触觉反馈运行时：GM 输出落地 → 推导震动事件 → 按平台触发。
 *
 * 触发时机是"正式叙事写入 log 的新回合"（refresh 拉回），而非流式 delta——
 * 协议标签只在完整输出里齐备，流式中途震动会产生噪音。首拉历史不震动，
 * 只对进入对局后新增的内容反馈；同批次多语义合并为一次最强事件并节流。
 *
 * 平台分流：Android 用 Vibration pattern 表达节奏差异（骰子哒哒哒 vs 受伤咚）；
 * iOS 公开 API 不支持自定义节奏，用 expo-haptics 的 Taptic 预设近似。
 */
import * as Haptics from 'expo-haptics'
import * as React from 'react'
import { Platform, Vibration } from 'react-native'

import { parseGMText } from '@/features/play/gmText'
import {
  deriveHapticEvents,
  patternFor,
  pickStrongest,
  specFor,
  type HapticEvent,
} from '@/lib/haptics'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/** 相邻两次对局事件震动的最小间隔，防止 refresh 连发时狂震 */
const GAME_THROTTLE_MS = 500
let lastGameBuzzAt = 0

const IMPACT_STYLES: Record<NonNullable<ReturnType<typeof specFor>['style']>, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
}

const NOTIFICATION_TYPES: Record<NonNullable<ReturnType<typeof specFor>['type']>, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fireOnce(event: HapticEvent): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate(patternFor(event))
      return
    }
    const spec = specFor(event)
    const times = Math.max(1, spec.repeats ?? 1)
    for (let index = 0; index < times; index += 1) {
      if (index > 0) await delay(spec.gapMs ?? 90)
      if (spec.kind === 'impact') {
        await Haptics.impactAsync(IMPACT_STYLES[spec.style ?? 'medium'])
      } else {
        await Haptics.notificationAsync(NOTIFICATION_TYPES[spec.type ?? 'success'])
      }
    }
  } catch {
    // 设备无振动能力（模拟器/权限关闭）时静默，不打断游玩
  }
}

/** 直调入口（UI 反馈、设置页试震）：只看开关，不参与叙事节流 */
export async function playGameHaptic(event: HapticEvent): Promise<void> {
  if (Platform.OS === 'web') return
  if (!useSettingsStore.getState().hapticsEnabled) return
  await fireOnce(event)
}

interface HapticBaseline {
  ready: boolean
  maxRound: number
  privateCount: number
}

/**
 * 对局页挂一次：监听 log 与私密感知，新内容落地时推导并触发震动。
 * 开关关闭期间照常推进基线，重新打开不会重放历史事件。
 */
export function useGameHaptics(): void {
  const log = useGameStore((s) => s.log)
  const privateMessages = useGameStore((s) => s.privateMessages)
  const enabled = useSettingsStore((s) => s.hapticsEnabled)
  const baseline = React.useRef<HapticBaseline>({ ready: false, maxRound: -Infinity, privateCount: 0 })

  React.useEffect(() => {
    const maxRound = log.reduce((acc, entry) => Math.max(acc, entry.round ?? -Infinity), -Infinity)
    const privateCount = privateMessages.length
    if (!baseline.current.ready || !enabled) {
      baseline.current = { ready: true, maxRound, privateCount }
      return
    }

    const freshEntries = log.filter((entry) => (entry.round ?? -Infinity) > baseline.current.maxRound)
    const hadNewPrivate = privateCount > baseline.current.privateCount
    baseline.current = { ready: true, maxRound, privateCount }
    if (!freshEntries.length && !hadNewPrivate) return

    const events: HapticEvent[] = []
    for (const entry of freshEntries) {
      if (!entry.gm_response && !entry.check_results?.length) continue
      const block = entry.gm_response
        ? parseGMText(entry.gm_response)
        : { tags: [], states: [] }
      events.push(
        ...deriveHapticEvents({
          text: entry.gm_response ?? '',
          tags: block.tags,
          states: block.states,
          checks: entry.check_results ?? [],
        }),
      )
    }
    if (hadNewPrivate) events.push('decision')

    const strongest = pickStrongest(events)
    const now = Date.now()
    if (!strongest || now - lastGameBuzzAt < GAME_THROTTLE_MS) return
    lastGameBuzzAt = now
    void fireOnce(strongest)
  }, [log, privateMessages, enabled])
}
