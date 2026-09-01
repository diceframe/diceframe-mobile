import * as React from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  View,
} from 'react-native'
import { ChevronDown, ChevronUp, Dices } from 'lucide-react-native'

import { StatusBadge, type StatusTone } from '@/components/patterns/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import type { CheckResult } from '@/api/types'
import { checkStatusOf, type CheckStatus } from '@/lib/check-status'
import {
  checkAccentOf,
  checkDetailOf,
  statusLabelKeyOf,
} from '@/lib/check-details'
import { useT } from '@/i18n/t'
import type { TKey } from '@/i18n/keyset'
import { cn } from '@/lib/utils'

/** 揭示动画时长：对齐 Web CheckRevealCard 的 720ms 骰子滚动 */
const REVEAL_DURATION_MS = 720

/** 检定结论 → 徽标色调：大成功=鎏金，成功走语义绿，失败/大失败走危险红 */
const STATUS_TONE: Record<CheckStatus, StatusTone> = {
  critical: 'gold',
  success: 'success',
  failure: 'destructive',
  fumble: 'destructive',
}

/**
 * 检定结果卡（对齐 Web CheckRevealCard）：
 * - 揭示动画（仅当前回合揭示卡传入 animate）：骰面滚动 720ms 后亮出结果
 * - 可展开明细：骰面、成功线、加值分解、优势说明、协助玩家
 * - 内嵌运气按钮：pending 时可当场花费/拒绝，已决议显示状态标记
 */
export function CheckCard({
  check,
  className,
  animate = false,
  canDecideLuck = false,
  busy = false,
  onDecideLuck,
}: {
  check: CheckResult
  className?: string
  /** 挂载时先隐藏结果、滚动 720ms 后揭示（只给当前回合的揭示卡用，历史卡不重放） */
  animate?: boolean
  /** 本端可做运气决议（GM 或检定归属者），不可决议时展示等待文案 */
  canDecideLuck?: boolean
  busy?: boolean
  onDecideLuck?: (check: CheckResult, spend: boolean) => void
}) {
  const t = useT()
  // 「减少动态效果」开启时跳过滚动直接揭示，初始值 false 只影响首帧
  const [reduceMotion, setReduceMotion] = React.useState(false)
  const [revealed, setRevealed] = React.useState(!animate)
  // 揭示后自动展开一次明细（新滚出的检定直接看到骰面），历史卡默认收起
  const [expanded, setExpanded] = React.useState(false)
  // 滚动进度 0→1：state 持有 Animated.Value（稳定且不触发重渲染），
  // 不用 useRef —— React Compiler 的 refs 规则禁止渲染期读 .current
  const [roll] = React.useState(() => new Animated.Value(0))

  React.useEffect(() => {
    async function syncReduceMotion() {
      try {
        setReduceMotion(await AccessibilityInfo.isReduceMotionEnabled())
      } catch {
        // 读不到系统设置时按「可动画」处理即可
      }
    }
    void syncReduceMotion()
    let subscription: { remove: () => void } | null = null
    try {
      // react-native-web 旧版可能未实现该事件，失败只损失动态切换
      subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    } catch {
      subscription = null
    }
    return () => subscription?.remove()
  }, [])

  React.useEffect(() => {
    if (!animate || revealed) return
    // 减少动态效果：0ms 揭示；正常：滚动满 720ms 再亮结果
    const timer = setTimeout(
      () => {
        setRevealed(true)
        setExpanded(true)
      },
      reduceMotion ? 0 : REVEAL_DURATION_MS,
    )
    return () => clearTimeout(timer)
  }, [animate, revealed, reduceMotion])

  const rolling = animate && !revealed
  React.useEffect(() => {
    if (!rolling || reduceMotion) return
    // 单段 0→1 循环：旋转 360° 归位视觉上无缝，缩放在中段鼓起再收回（对齐 Web 关键帧）
    const loop = Animated.loop(
      Animated.timing(roll, {
        toValue: 1,
        duration: REVEAL_DURATION_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [rolling, reduceMotion, roll])

  const status = checkStatusOf(check)
  const statusKey = statusLabelKeyOf(status)
  const accent = checkAccentOf(status)
  const detail = checkDetailOf(check, t('dfCheckOpponent'))
  const actorLabel = check.actor_name || check.actor_uid || ''

  // 明细行按字段存在性逐条渲染，缺什么少一行（不硬造内容）；
  // 上游镜像 key 的插值名各不相同（rolls/calculation/verdict/detail/players），按 key 分别传参
  const detailRows: { key: TKey; options: Record<string, unknown> }[] = [
    { key: 'checkDiceFaces', options: { rolls: detail.diceFaces.join(', ') } },
    { key: 'checkCalculation', options: { calculation: detail.math } },
    { key: 'checkVerdictDetail', options: { verdict: t(statusKey) } },
  ]
  if (detail.successLevels) {
    detailRows.push({ key: 'checkSuccessLevels', options: { ...detail.successLevels } })
  }
  if (detail.modifierBreakdown) {
    detailRows.push({
      key: 'checkModifierBreakdown',
      options: { detail: detail.modifierBreakdown },
    })
  }
  if (detail.advantageNote) {
    detailRows.push({ key: 'checkAdvantageNote', options: { detail: detail.advantageNote } })
  }
  if (detail.assists) {
    detailRows.push({ key: 'checkAssist', options: { players: detail.assists } })
  }

  const luckPending = check.luck_decision === 'pending'
  const luckDecidedByMe = luckPending && canDecideLuck

  return (
    <Card
      className={cn(
        'gap-1.5 rounded-xl border p-4',
        // 左边框按结论着色（Web 同款）：揭示中保持危险红，成功/大成功单独覆盖
        accent === 'success' && revealed ? 'border-l-4 border-l-success' : null,
        accent === 'gold-strong' && revealed ? 'border-l-4 border-l-gold-strong' : null,
        accent === 'destructive' ? 'border-l-4 border-l-destructive' : null,
        className,
      )}
      accessibilityLabel={t('checkCardLabel', { name: actorLabel })}
    >
      <View className="flex-row items-center gap-2.5">
        {/* 骰面方块：滚动期转「✦」，揭示后亮出真实出目 */}
        <Animated.View
          style={
            rolling
              ? {
                  transform: [
                    { rotate: roll.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
                    {
                      scale: roll.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.9, 1.08, 0.9],
                      }),
                    },
                  ],
                }
              : undefined
          }
          className={cn(
            'h-10 w-10 items-center justify-center rounded-lg border border-border',
            rolling ? 'bg-muted' : 'bg-gold/10',
          )}
        >
          {rolling ? (
            <Icon as={Dices} size={18} className="text-muted-foreground" />
          ) : (
            <Text className="font-mono text-base font-bold text-gold-strong">
              {check.roll ?? '?'}
            </Text>
          )}
        </Animated.View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="small" numberOfLines={1}>
            {check.label || check.skill || check.attribute || t('dfCheckDefaultLabel')}
          </Text>
          {actorLabel ? (
            <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
              {actorLabel}
            </Text>
          ) : null}
        </View>
        <StatusBadge tone={rolling ? 'warning' : STATUS_TONE[status]}>
          {rolling ? t('diceRolling') : t(statusKey)}
        </StatusBadge>
      </View>

      {revealed ? (
        <>
          <Text className="ml-12 font-mono text-base">{detail.math}</Text>

          {/* 明细区：揭示卡自动展开一次，历史卡点开查看 */}
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            className="ml-12 flex-row items-center gap-1 self-start active:opacity-70"
            accessibilityLabel={t('checkDetails')}
            accessibilityState={{ expanded }}
          >
            <Icon
              as={expanded ? ChevronUp : ChevronDown}
              size={13}
              className="text-muted-foreground"
            />
            <Text variant="small" className="text-muted-foreground">
              {t('checkDetails')}
            </Text>
          </Pressable>
          {expanded ? (
            <View className="ml-12 gap-1">
              {detailRows.map((row) => (
                <Text key={row.key} variant="small" className="text-muted-foreground">
                  {t(row.key, row.options)}
                </Text>
              ))}
            </View>
          ) : null}

          {/* 运气决议：按钮内嵌在卡内，与顶部 LuckCard 同源（同一份 check 数据） */}
          {luckPending ? (
            luckDecidedByMe ? (
              <View className="ml-12 mt-1 flex-row gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onPress={() => onDecideLuck?.(check, true)}
                >
                  <Text>{t('spendLuckForSuccess', { cost: check.luck_cost || 0 })}</Text>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onPress={() => onDecideLuck?.(check, false)}
                >
                  <Text>{t('keepFailure')}</Text>
                </Button>
              </View>
            ) : (
              <Text variant="small" className="ml-12 text-warning">
                {t('waitLuckDecision', { name: actorLabel })}
              </Text>
            )
          ) : check.luck_decision === 'spent' && check.luck_spent ? (
            <Text variant="small" className="ml-12 text-warning">
              {t('luckSpent', { cost: check.luck_spent })}
            </Text>
          ) : check.luck_decision === 'declined' ? (
            <Text variant="small" className="ml-12 text-muted-foreground">
              {t('luckDeclined')}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
