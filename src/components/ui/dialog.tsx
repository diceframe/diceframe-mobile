import * as React from 'react'
import { Modal, Pressable, View } from 'react-native'

import { cn } from '@/lib/utils'

type DialogProps = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

/** 居中模态对话框；点击遮罩关闭 */
export function Dialog({ open, onClose, children, className }: DialogProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 items-center justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable className="w-full max-w-md" onPress={(e) => e.stopPropagation()}>
          <View
            className={cn(
              'rounded-lg border border-border bg-card p-5 gap-3',
              className,
            )}
          >
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
