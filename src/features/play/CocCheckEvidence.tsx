import { View } from 'react-native'

import type { CheckResult } from '@/api/types'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { cocCheckEvidenceOf } from '@/lib/coc-check-evidence'

/** 实时、运气待决与历史卡共用；宿主只在检定已揭示后挂载。 */
export function CocCheckEvidence({ check, className }: { check: CheckResult; className?: string }) {
  const t = useT()
  const rows = cocCheckEvidenceOf(check, t)
  if (!rows.length) return null
  return (
    <View className={className}>
      {rows.map(({ kind, text }) => (
        <Text key={kind} variant="small" className="text-muted-foreground">{text}</Text>
      ))}
    </View>
  )
}
