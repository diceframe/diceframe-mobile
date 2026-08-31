import * as React from 'react'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'

/** 表单字段统一包装：小标题 + 内容 + 可选说明，纵向排列（与既有编辑器的间距节奏一致） */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View className="gap-1.5">
      <Text variant="small" className="font-semibold text-muted-foreground">{label}</Text>
      {children}
      {hint ? <Text variant="small" className="text-muted-foreground">{hint}</Text> : null}
    </View>
  )
}
