import * as React from 'react'
import { AppState, View } from 'react-native'
import { useIsFocused } from 'expo-router'
import { Bell } from 'lucide-react-native'
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useT } from '@/i18n/t'

/** 仅在已发现新版时挂载；停留首页时轻摇提醒，离开页面或切到后台即停止。 */
export function UpdateBell({ version, onPress }: { version: string; onPress: () => void }) {
  const t = useT()
  const focused = useIsFocused()
  const reduceMotion = useReducedMotion()
  const rotation = useSharedValue(0)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.get()}deg` }],
  }))

  React.useEffect(() => {
    function syncAnimation() {
      cancelAnimation(rotation)
      rotation.set(0)
      if (!focused || reduceMotion || AppState.currentState !== 'active') return
      // 衰减摆动后留出间隔，避免持续晃动干扰阅读。
      rotation.set(withRepeat(withSequence(
        withTiming(12, { duration: 120 }),
        withTiming(-10, { duration: 180 }),
        withTiming(7, { duration: 160 }),
        withTiming(-4, { duration: 140 }),
        withTiming(0, { duration: 120 }),
        withDelay(2600, withTiming(0, { duration: 0 })),
      ), -1, false, undefined, ReduceMotion.System))
    }
    syncAnimation()
    const subscription = AppState.addEventListener('change', syncAnimation)
    return () => {
      subscription.remove()
      cancelAnimation(rotation)
      rotation.set(0)
    }
  }, [focused, reduceMotion, rotation])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-11 w-11"
      onPress={onPress}
      accessibilityLabel={t('dfUpdatesNewVersionFound', { version })}
    >
      <View className="relative p-1" pointerEvents="none">
        <Animated.View style={[{ transformOrigin: '50% 15%' }, animatedStyle]}>
          <Icon as={Bell} size={21} />
        </Animated.View>
        <View className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
      </View>
    </Button>
  )
}
