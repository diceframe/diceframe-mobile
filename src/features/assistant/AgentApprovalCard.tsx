import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { eventResultText, type AgentApproval } from '@/lib/assistant-agent'

import { agentToolLabel } from './agentLabels'

/**
 * 待确认操作卡（对齐上游 assistant-approval）：Agent 想执行会改数据的工具时停在这里，
 * 「确认执行」才真正执行；过期或草稿已改动的批准只能取消，让 Agent 重新生成方案。
 */
export function AgentApprovalCard({
  approval,
  busy,
  onConfirm,
  onCancel,
}: {
  approval: AgentApproval
  busy: boolean
  onConfirm: () => void
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

  return (
    <View className="gap-2 rounded-lg border border-warning bg-warning/10 p-3" accessibilityLiveRegion="polite">
      <Text className="font-semibold">{t('dfAgentPending')}</Text>
      <Text>{approval.label || agentToolLabel(t, approval.tool)}</Text>
      {target ? <Text variant="small" className="font-semibold">{t('dfAgentTarget')}: {target}</Text> : null}
      {invalid ? <Text variant="small" className="text-destructive">{t('dfAgentApprovalInvalid')}</Text> : null}
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
        <Button size="sm" className="flex-1" disabled={busy || invalid} onPress={onConfirm}>
          {busy ? <ActivityIndicator size="small" /> : null}
          <Text>{t('dfAgentApprove')}</Text>
        </Button>
        <Button size="sm" variant="outline" className="flex-1" disabled={busy} onPress={onCancel}>
          <Text>{t('cancel')}</Text>
        </Button>
      </View>
    </View>
  )
}
