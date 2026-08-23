import * as React from 'react'
import { View, type ViewProps } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn('rounded-lg border border-border bg-card p-5 gap-2', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('gap-1.5', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="h3" className={cn(className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="small" className={cn(className)} {...props} />
}

function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn(className)} {...props} />
}

function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('flex-row items-center gap-2 pt-2', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
