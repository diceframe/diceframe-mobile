import * as React from 'react'
import { Image, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

type AvatarProps = {
  /** 图片地址；为空时显示名字首字符 */
  source?: string | null
  name?: string | null
  className?: string
  /** 方形（NPC/物品） */
  square?: boolean
}

export function Avatar({ source, name, className, square = false }: AvatarProps) {
  const shape = square ? 'rounded-md' : 'rounded-full'
  const initial = (name ?? '?').trim().charAt(0).toUpperCase()
  return (
    <View
      className={cn(
        'h-10 w-10 items-center justify-center overflow-hidden bg-muted',
        shape,
        className,
      )}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityLabel={name ?? undefined}
        />
      ) : (
        <Text className="text-base font-semibold text-muted-foreground">{initial}</Text>
      )}
    </View>
  )
}
