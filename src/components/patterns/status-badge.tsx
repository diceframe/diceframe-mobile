import * as React from 'react'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export type StatusTone =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'info'
  | 'gold'

const STANDARD_VARIANTS = {
  default: 'default',
  secondary: 'secondary',
  destructive: 'destructive',
  outline: 'outline',
} as const

const SEMANTIC_STYLES = {
  success: {
    badge: 'border-transparent bg-success',
    text: 'text-success-foreground',
  },
  warning: {
    badge: 'border-transparent bg-warning',
    text: 'text-warning-foreground',
  },
  info: {
    badge: 'border-transparent bg-info',
    text: 'text-info-foreground',
  },
  gold: {
    badge: 'border-transparent bg-gold-strong',
    text: 'text-gold-foreground',
  },
} as const

type StatusBadgeProps = Omit<BadgeProps, 'variant' | 'children'> & {
  tone?: StatusTone
  children: React.ReactNode
  textClassName?: string
}

export function StatusBadge({
  tone = 'default',
  children,
  className,
  textClassName,
  ...props
}: StatusBadgeProps) {
  const standardVariant = tone in STANDARD_VARIANTS
    ? STANDARD_VARIANTS[tone as keyof typeof STANDARD_VARIANTS]
    : 'outline'
  const semantic = tone in SEMANTIC_STYLES
    ? SEMANTIC_STYLES[tone as keyof typeof SEMANTIC_STYLES]
    : null

  return (
    <Badge
      variant={standardVariant}
      className={cn(semantic?.badge, className)}
      {...props}
    >
      <Text className={cn(semantic?.text, textClassName)}>{children}</Text>
    </Badge>
  )
}
