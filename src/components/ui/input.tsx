import * as React from 'react'
import { TextInput, type TextInputProps } from 'react-native'

import { cn } from '@/lib/utils'

export type InputProps = TextInputProps & {
  className?: string
}

export function Input({ className, placeholderClassName, ...props }: InputProps) {
  return (
    <TextInput
      className={cn(
        'h-11 rounded-md border border-input bg-background px-4 text-base text-foreground web:ring-offset-background web:focus-visible:outline-none',
        props.editable === false && 'opacity-50',
        className,
      )}
      placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
      {...props}
    />
  )
}
