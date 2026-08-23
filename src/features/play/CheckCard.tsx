import { View } from 'react-native'

import { Badge, BadgeText } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import type { CheckResult } from '@/api/types'
import { cn } from '@/lib/utils'

type CheckStatus = 'critical' | 'fumble' | 'success' | 'failure'

function statusOf(check: CheckResult): CheckStatus {
  if (check.is_critical) return 'critical'
  if (check.is_fumble) return 'fumble'
  const verdict = String(check.verdict || '').toLowerCase()
  return verdict.includes('成功') || verdict.includes('success') ? 'success' : 'failure'
}

const STATUS_LABEL: Record<CheckStatus, string> = {
  critical: '大成功',
  fumble: '大失败',
  success: '成功',
  failure: '失败',
}

/** 检定结果卡（对齐 Web CheckRevealCard：大成功=鎏金，成功/失败走语义令牌） */
export function CheckCard({ check, className }: { check: CheckResult; className?: string }) {
  const status = statusOf(check)
  const statusVariant =
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
          {check.label || check.skill || check.attribute || '检定'}
        </Text>
        <Badge variant={statusVariant}>
          <BadgeText>{STATUS_LABEL[status]}</BadgeText>
        </Badge>
      </View>
      <Text className="font-mono text-base">{parts.join(' ')}</Text>
      {typeof check.opponent_total === 'number' && (
        <Text variant="small">
          对抗：{check.opponent_name ?? '对手'} d20={check.opponent_roll} = {check.opponent_total}
        </Text>
      )}
      {check.luck_decision === 'pending' && check.luck_spend_available ? (
        <Text variant="small" className="text-warning">
          可花费运气 {check.luck_cost ?? '?'} 重骰
        </Text>
      ) : null}
    </Card>
  )
}
