import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import type { ActionRecovery, ActionRecoveryCode } from '@/lib/action-recovery'

const MESSAGE: Record<ActionRecoveryCode, TKey> = {
  ROUND_PROCESSING_FAILED: 'dfRecoveryRolledBack',
  ROUND_POST_COMMIT_FAILED: 'dfRecoveryPostCommit',
  ROUND_NOT_PROCESSED: 'dfRecoveryNotProcessed',
  UNKNOWN: 'dfRecoveryUnknown',
}

/** 行动提交失败的恢复提示（对齐上游 ActionRecoveryBanner）：先刷新核对，或回到草稿编辑。 */
export function ActionRecoveryBanner({
  recovery,
  refreshing,
  onRefresh,
  onEdit,
}: {
  recovery: ActionRecovery
  refreshing: boolean
  onRefresh: () => void
  onEdit: () => void
}) {
  const t = useT()
  return (
    <View
      className="mx-3 mb-1 gap-2 rounded-lg border border-warning bg-warning/10 px-3 py-2"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text variant="small">{t(recovery.confirmed ? 'dfRecoveryConfirmed' : MESSAGE[recovery.code])}</Text>
      <View className="flex-row gap-2">
        {recovery.kind === 'refresh' ? (
          <Button size="sm" disabled={refreshing} onPress={onRefresh}>
            <Text>{t('dfRecoveryRefresh')}</Text>
          </Button>
        ) : (
          <Button size="sm" variant="outline" onPress={onEdit}>
            <Text>{t('dfRecoveryEdit')}</Text>
          </Button>
        )}
      </View>
    </View>
  )
}
