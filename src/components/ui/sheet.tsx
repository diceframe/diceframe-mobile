import * as React from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { cn } from '@/lib/utils'

type SheetProps = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  /** 隐藏顶部把手 */
  noHandle?: boolean
  /** 由 Sheet 提供滚动；关闭后由子组件接管唯一滚动容器 */
  scrollable?: boolean
}

/** 底部抽屉（Modal + slide）；键盘弹出时整体垫高，内容超高时内部滚动 */
export function Sheet({
  open,
  onClose,
  children,
  className,
  noHandle = false,
  scrollable = true,
}: SheetProps) {
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
        <View
          className={cn(
            'max-h-[90%] rounded-t-xl border-t border-border bg-card px-5 pt-2',
            className,
          )}
          style={{ paddingBottom: insets.bottom + 16 + keyboardHeight }}
        >
          {!noHandle && (
            <View className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          )}
          {scrollable ? (
            <ScrollView
              style={{ flexShrink: 1 }}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View className="min-h-0 flex-1">{children}</View>
          )}
        </View>
      </View>
    </Modal>
  )
}
