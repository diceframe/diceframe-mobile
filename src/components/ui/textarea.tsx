import { useThemeToken } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Platform, TextInput } from 'react-native'

function Textarea({
  className,
  style,
  multiline = true,
  numberOfLines = Platform.select({ web: 2, native: 8 }), // On web, numberOfLines also determines initial height. On native, it determines the maximum height.
  placeholderClassName,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  const foreground = useThemeToken('foreground')
  const mutedForeground = useThemeToken('mutedForeground')

  return (
    <TextInput
      placeholderTextColor={mutedForeground}
      style={[{ color: foreground }, style]}
      className={cn(
        'border-input dark:bg-input/30 flex min-h-16 w-full flex-row rounded-md border bg-transparent px-3 py-2 text-base shadow-sm shadow-black/5 md:text-sm',
        Platform.select({
          web: 'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive field-sizing-content resize-y outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed',
        }),
        Platform.select({ native: 'placeholder:text-muted-foreground/50' }),
        props.editable === false && 'opacity-50',
        className
      )}
      placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  )
}

export { Textarea }
