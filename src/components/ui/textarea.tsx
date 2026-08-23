import * as React from 'react'
import { TextInput, type TextInputProps } from 'react-native'

import { cn } from '@/lib/utils'

export type TextareaProps = TextInputProps & {
  className?: string
}

export function Textarea({ className, placeholderClassName, ...props }: TextareaProps) {
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      className={cn(
        'min-h-24 rounded-md border border-input bg-background px-4 py-3 text-base text-foreground',
        props.editable === false && 'opacity-50',
        className,
      )}
      placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
      {...props}
    />
  )
}
