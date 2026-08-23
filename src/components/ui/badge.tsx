import * as React from 'react'
import { View, type ViewProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

const badgeVariants = cva('flex flex-row items-center rounded-md border-border px-2.5 py-0.5', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      destructive: 'border-transparent bg-destructive text-destructive-foreground',
      outline: 'border-border text-foreground',
      success: 'border-transparent bg-success text-success-foreground',
      warning: 'border-transparent bg-warning text-warning-foreground',
      info: 'border-transparent bg-info text-info-foreground',
      gold: 'border-transparent bg-gold-strong text-gold-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export type BadgeProps = ViewProps & VariantProps<typeof badgeVariants> & { className?: string }

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <View className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function BadgeText({
  className,
  ...props
}: React.ComponentProps<typeof Text> & { className?: string }) {
  return <Text className={cn('text-sm font-medium', className)} {...props} />
}
