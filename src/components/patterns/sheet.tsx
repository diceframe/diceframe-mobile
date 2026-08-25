import * as React from 'react'
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PortalHost } from '@rn-primitives/portal'

import { appLayoutForWidth } from '@/lib/layout'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { cn } from '@/lib/utils'

/** Sheet portal 名称 - 用于在 Sheet 内部渲染浮层内容 */
export const SHEET_PORTAL_NAME = 'SheetPortal'

/** 在 Sheet 内部使用，获取 portal host 名称 */
export function useSheetPortal() {
  return SHEET_PORTAL_NAME
}

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
  const { width } = useWindowDimensions()
  const { isTablet } = appLayoutForWidth(width)
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className={cn('flex-1', isTablet ? 'items-center justify-center px-6' : 'justify-end')}>
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />
        <View
          className={cn(
            'max-h-[90%] border-border bg-card px-5 pt-2',
            isTablet ? 'w-full rounded-xl border' : 'rounded-t-xl border-t',
            className,
          )}
          style={{
            maxWidth: isTablet ? 680 : undefined,
            paddingBottom: (isTablet ? 16 : insets.bottom + 16) + keyboardHeight,
          }}
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
        {/* Portal 层 - 用于渲染浮层内容（如 Select 下拉框） */}
        <PortalHost name={SHEET_PORTAL_NAME} />
      </View>
    </Modal>
  )
}
