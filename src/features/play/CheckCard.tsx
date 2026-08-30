import { View } from 'react-native'

import { StatusBadge, type StatusTone } from '@/components/patterns/status-badge'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import type { CheckResult } from '@/api/types'
import { checkStatusOf, type CheckStatus } from '@/lib/check-status'
import { useT } from '@/i18n/t'
import type { TKey } from '@/i18n/keyset'
import { cn } from '@/lib/utils'

/** 检定结论 → 文案 key：成功/失败复用上游 key，大成功/大失败是移动端 df key */
const STATUS_LABEL_KEY: Record<CheckStatus, TKey> = {
  critical: 'dfCheckCritical',
  fumble: 'dfCheckFumble',
  success: 'checkSuccess',
  failure: 'checkFailure',
}

/** 检定结果卡（对齐 Web CheckRevealCard：大成功=鎏金，成功/失败走语义令牌） */
export function CheckCard({ check, className }: { check: CheckResult; className?: string }) {
  const t = useT()
  const status = checkStatusOf(check)
  const statusTone: StatusTone =
    status === 'critical' ? 'gold' : status === 'success' ? 'success' : 'destructive'

  const parts: string[] = []
  // CoC（d100）用 threshold 百分比检定，d20 用 DC/加值，从结果字段反推骰型
  const dice = check.dice || (typeof check.threshold === 'number' ? 'd100' : 'd20')
  parts.push(`${dice}=${check.roll ?? '?'}`)
  const modifier = Number(check.modifier || 0)
  if (modifier) parts.push(`${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`)
  if (typeof check.total === 'number') parts.push(`= ${check.total}`)
  if (typeof check.threshold === 'number') parts.push(`/ ${check.threshold}%`)
  else if (typeof check.dc === 'number') parts.push(`/ DC ${check.dc}`)

  const actorLabel = check.actor_name || check.actor_uid || ''

  return (
    <Card className={cn('gap-1.5 p-4', className)}>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="small" className="flex-1" numberOfLines={1}>
          {actorLabel ? `${actorLabel} · ` : ''}
          {check.label || check.skill || check.attribute || t('dfCheckDefaultLabel')}
        </Text>
        <StatusBadge tone={statusTone}>{t(STATUS_LABEL_KEY[status])}</StatusBadge>
      </View>
      <Text className="font-mono text-base">{parts.join(' ')}</Text>
      {typeof check.opponent_total === 'number' && (
        <Text variant="small">
          {t('dfCheckOpposed', {
            name: check.opponent_name ?? t('dfCheckOpponent'),
            roll: check.opponent_roll,
            total: check.opponent_total,
          })}
        </Text>
      )}
      {check.luck_decision === 'pending' && check.luck_spend_available ? (
        <Text variant="small" className="text-warning">
          {t('dfCheckLuckAvailable', { cost: check.luck_cost ?? '?' })}
        </Text>
      ) : null}
    </Card>
  )
}
