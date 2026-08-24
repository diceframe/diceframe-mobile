import * as React from 'react'
import * as AvatarPrimitive from '@rn-primitives/avatar'

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

function Avatar({ source, name, className, square = false }: AvatarProps) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase()
  return (
    <AvatarPrimitive.Root
      alt={name ?? 'avatar'}
      className={cn(
        'h-10 w-10 items-center justify-center overflow-hidden bg-muted',
        square ? 'rounded-md' : 'rounded-full',
        className,
      )}
    >
      {source ? (
        <AvatarPrimitive.Image
          source={{ uri: source }}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityLabel={name ?? undefined}
        />
      ) : null}
      <AvatarPrimitive.Fallback>
        <Text className="text-base font-semibold text-muted-foreground">{initial}</Text>
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

export { Avatar }
