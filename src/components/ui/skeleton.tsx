import * as React from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'

import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  const opacity = useSharedValue(1)

  React.useEffect(() => {
    opacity.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true)
  }, [opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return <Animated.View className={cn('rounded-md bg-muted', className)} style={style} />
}
