import * as React from 'react'
import { Pressable, type PressableProps } from 'react-native'

import { cn } from '@/lib/utils'

/** 统一尺寸的图标按钮（页头/顶栏动作区） */
export function IconButton({
  className,
  children,
  ...props
}: PressableProps & { className?: string; children: React.ReactNode }) {
  return (
    <Pressable
      className={cn('h-10 w-10 items-center justify-center rounded-md active:bg-accent', className)}
      {...props}
    >
      {children}
    </Pressable>
  )
}
