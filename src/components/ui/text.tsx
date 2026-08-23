import * as React from 'react'
import { Text as RNText, type TextProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const textVariants = cva('text-foreground text-base', {
  variants: {
    variant: {
      default: '',
      // 标题用衬线字体（对齐 Web --df-font-title）
      h1: 'font-display text-3xl font-bold tracking-tight',
      h2: 'font-display text-2xl font-bold tracking-tight',
      h3: 'font-display text-xl font-semibold tracking-tight',
      h4: 'font-display text-lg font-semibold tracking-tight',
      muted: 'text-muted-foreground',
      small: 'text-sm text-muted-foreground',
      lead: 'text-lg text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface TextPropsWithRef
  extends TextProps,
    VariantProps<typeof textVariants> {
  className?: string
}

export function Text({ className, variant, ...props }: TextPropsWithRef) {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />
}
