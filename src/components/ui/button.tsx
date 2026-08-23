import * as React from 'react'
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-md active:opacity-80 web:transition-colors web:select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        secondary: 'bg-secondary',
        destructive: 'bg-destructive destructive-foreground',
        outline: 'border border-input bg-background active:bg-accent',
        ghost: 'active:bg-accent',
        link: 'text-primary underline-offset-4 active:underline',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 rounded-sm px-3',
        lg: 'h-13 rounded-lg px-8',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = PressableProps & VariantProps<typeof buttonVariants> & {
  className?: string
  loading?: boolean
  children?: React.ReactNode
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size }),
        (disabled || loading) && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" className="text-primary-foreground" /> : children}
    </Pressable>
  )
}

type ButtonTextProps = React.ComponentProps<typeof Text>

export function ButtonText({ className, ...props }: ButtonTextProps) {
  // link/ghost/outline 等变体由调用方通过 className 覆盖文字颜色
  return (
    <Text className={cn('text-base font-medium text-primary-foreground', className)} {...props} />
  )
}
