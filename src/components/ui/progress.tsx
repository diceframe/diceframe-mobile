import * as React from 'react'
import * as ProgressPrimitive from '@rn-primitives/progress'

import { cn } from '@/lib/utils'

type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string
}

function Progress({ className, value, indicatorClassName, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0))
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full rounded-full bg-primary', indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
