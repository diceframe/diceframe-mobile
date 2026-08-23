import * as React from 'react'
import { View, type ViewProps } from 'react-native'

import { cn } from '@/lib/utils'

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ViewProps & { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <View
      role="separator"
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  )
}
