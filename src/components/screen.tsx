import * as React from 'react'
import { View, type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { GlassBackdrop } from '@/components/patterns/glass-backdrop'
import { cn } from '@/lib/utils'
import { useGlass } from '@/lib/use-glass'

/**
 * 页面容器：处理 edge-to-edge 安全区，统一背景。液态玻璃风格下背景换成环境光画布——
 * 画在每个页面里而不是导航根部，页面本身仍然不透明，转场时不会透出上一页。
 */
export function Screen({ className, children, ...props }: ViewProps & { className?: string }) {
  const glass = useGlass()
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {glass.active ? <GlassBackdrop theme={glass.theme} /> : null}
      <View className={cn('flex-1', className)} {...props}>
        {children}
      </View>
    </SafeAreaView>
  )
}
