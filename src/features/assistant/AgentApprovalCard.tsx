import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { eventResultText, executionReport, type AgentApproval } from '@/lib/assistant-agent'

import { agentExecutionStatusLabel, agentToolLabel } from './agentLabels'

/** 逐项目标最多列这么多条：报告可能覆盖整库资料册，卡片只是让房主核对剩余目标 */
const MAX_TARGETS = 20

/**
 * 待确认操作卡（对齐上游 assistant-approval）：Agent 想执行会改数据的工具时停在这里，
 * 「确认执行」才真正执行；过期或草稿已改动的批准只能取消，让 Agent 重新生成方案。
 * 批量计划没跑完时（resumable）换成「继续剩余目标」，并附上逐项执行报告（上游 AgentExecutionSummary）。
 */
export function AgentApprovalCard({
  approval,
  busy,
  onConfirm,
  onResume,
  onCancel,
}: {
  approval: AgentApproval
  busy: boolean
  onConfirm: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [showDetails, setShowDetails] = React.useState(false)
  const invalid = !!approval.expired || !!approval.recovery_required
  const preview = approval.preview
  const target = preview && typeof preview === 'object' && !Array.isArray(preview)
    && typeof (preview as Record<string, unknown>).target_name === 'string'
    ? (preview as Record<string, unknown>).target_name as string
    : ''
  const details = approval.preview ?? approval.arguments
  const report = executionReport(approval)
  const counts = report
    ? [
        report.succeeded !== undefined ? t('dfAgentExecSucceededCount', { count: report.succeeded }) : '',
        report.failed !== undefined ? t('dfAgentExecFailedCount', { count: report.failed }) : '',
        report.notExecuted !== undefined ? t('dfAgentExecNotExecutedCount', { count: report.notExecuted }) : '',
        report.unconfirmed ? t('dfAgentExecUnconfirmedCount', { count: report.unconfirmed }) : '',
      ].filter(Boolean)
    : []

  return (
    <View className="gap-2 rounded-lg border border-warning bg-warning/10 p-3" accessibilityLiveRegion="polite">
      <Text className="font-semibold">{t('dfAgentPending')}</Text>
      {/* label 是服务端给模型看的英文工具描述，界面按上游只显示本地化工具名 */}
      <Text>{agentToolLabel(t, approval.tool)}</Text>
      {target ? <Text variant="small" className="font-semibold">{t('dfAgentTarget')}: {target}</Text> : null}
      {invalid ? <Text variant="small" className="text-destructive">{t('dfAgentApprovalInvalid')}</Text> : null}
      {report ? (
        <View className="gap-1 rounded-md border border-border bg-background/60 p-2">
          <Text variant="small" className="font-semibold">
            {t('dfAgentExecutionPlan')}
            {report.status ? ` · ${agentExecutionStatusLabel(t, report.status)}` : ''}
          </Text>
          {counts.length ? <Text variant="small" className="text-muted-foreground">{counts.join(' · ')}</Text> : null}
          {report.targets.slice(0, MAX_TARGETS).map((item) => (
            <View key={item.id} className="gap-0.5">
              <View className="flex-row items-start gap-2">
                <Text variant="small" className="min-w-0 flex-1" numberOfLines={1}>{item.label}</Text>
                <Text
                  variant="small"
                  className={item.status === 'failed' ? 'text-destructive' : item.status === 'succeeded' ? 'text-muted-foreground' : 'text-warning'}
                >
                  {agentExecutionStatusLabel(t, item.status)}
                </Text>
              </View>
              {item.error ? <Text variant="small" className="text-destructive">{item.error}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {approval.resumable ? <Text variant="small" className="text-muted-foreground">{t('dfAgentResumeHint')}</Text> : null}
      {details !== undefined ? (
        <View className="gap-1">
          <Pressable onPress={() => setShowDetails(!showDetails)} className="self-start active:opacity-70">
            <Text variant="small" className="text-muted-foreground">
              {showDetails ? t('dfAgentHideDetails') : t('dfAgentDetails')}
            </Text>
          </Pressable>
          {showDetails ? (
            <Text selectable className="font-mono text-xs text-muted-foreground">{eventResultText(details, true)}</Text>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <Button size="sm" className="flex-1" disabled={busy || invalid} onPress={approval.resumable ? onResume : onConfirm}>
          {busy ? <ActivityIndicator size="small" /> : null}
          <Text>{approval.resumable ? t('dfAgentResumeTargets') : t('dfAgentApprove')}</Text>
        </Button>
        <Button size="sm" variant="outline" className="flex-1" disabled={busy} onPress={onCancel}>
          <Text>{t('cancel')}</Text>
        </Button>
      </View>
    </View>
  )
}
