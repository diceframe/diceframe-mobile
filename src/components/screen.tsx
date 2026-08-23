import * as React from 'react'
import { View, type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { cn } from '@/lib/utils'

/** 页面容器：处理 edge-to-edge 安全区，统一背景 */
export function Screen({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className={cn('flex-1', className)} {...props}>
        {children}
      </View>
    </SafeAreaView>
  )
}
