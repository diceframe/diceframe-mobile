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
}

/** 底部抽屉（Modal + slide）；键盘弹出时整体垫高，内容超高时内部滚动 */
export function Sheet({ open, onClose, children, className, noHandle = false }: SheetProps) {
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
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className={cn(
              'rounded-t-xl border-t border-border bg-card px-5 pt-2',
              className,
            )}
            style={{ paddingBottom: insets.bottom + 16 + keyboardHeight }}
          >
            {!noHandle && (
              <View className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            )}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
