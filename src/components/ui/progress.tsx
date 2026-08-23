import * as React from 'react'
import { View } from 'react-native'

import { cn } from '@/lib/utils'

type ProgressProps = {
  /** 0-100 */
  value: number
  className?: string
  indicatorClassName?: string
}

export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <View className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <View
        className={cn('h-full rounded-full bg-primary', indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </View>
  )
}
