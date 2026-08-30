import * as React from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Mic, Send } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { appendActionText } from '@/lib/action-text'
import { cn } from '@/lib/utils'

export interface VoiceInputState {
  recording: boolean
  busy: boolean
  available: boolean
  error: string
  onToggle: () => void
}

export function ActionComposer({
  value,
  onChangeText,
  onSend,
  busy,
  disabled,
  disabledReason,
  quickActions,
  voice,
  topControls,
}: {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  busy: boolean
  disabled?: boolean
  disabledReason?: string
  quickActions: string[]
  voice?: VoiceInputState
  topControls?: React.ReactNode
}) {
  const t = useT()
  const locked = busy || !!disabled

  return (
    <View className="gap-2 pb-2">
      {topControls}
      {quickActions.length > 0 && (
        <ScrollView
          horizontal
          className="mt-2 max-h-9"
          contentContainerClassName="gap-2 px-3"
          showsHorizontalScrollIndicator={false}
        >
          {quickActions.map((action) => (
            <Pressable
              key={action}
              onPress={() => onChangeText(appendActionText(value, action))}
              disabled={locked}
              className={cn(
                'rounded-full border border-border bg-muted px-3 py-1 active:bg-accent',
                locked && 'opacity-50',
              )}
            >
              <Text className="text-sm text-muted-foreground">{action}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View className="flex-row items-end gap-2 px-3">
        {voice?.available ? (
          <Pressable
            onPress={voice.onToggle}
            disabled={voice.busy || (locked && !voice.recording)}
            accessibilityLabel={voice.recording ? t('dfPlayRecordStop') : t('dfPlayRecordStart')}
            className={cn(
              'h-12 w-12 shrink-0 items-center justify-center rounded-full',
              voice.recording ? 'bg-destructive' : 'border border-input bg-background',
              (voice.busy || (locked && !voice.recording)) && 'opacity-50',
            )}
          >
            <Icon
              as={Mic}
              size={20}
              className={voice.recording ? 'text-destructive-foreground' : 'text-muted-foreground'}
            />
          </Pressable>
        ) : null}

        <Textarea
          value={value}
          onChangeText={onChangeText}
          placeholder={t('actionPlaceholder')}
          className="min-h-12 flex-1"
          editable={!locked}
          multiline
        />

        <Button
          size="icon"
          onPress={onSend}
          disabled={locked || !value.trim()}
          accessibilityLabel={t('send')}
          className="h-12 w-12 shrink-0"
        >
          <Icon as={Send} size={18} />
        </Button>
      </View>

      {voice?.error ? <Text className="px-3 text-destructive">{voice.error}</Text> : null}
      {disabledReason ? <Text variant="small" className="px-3">{disabledReason}</Text> : null}
      {voice?.recording ? (
        <Text variant="small" className="px-3 text-destructive">
          {t('dfPlayRecordingHint')}
        </Text>
      ) : null}
    </View>
  )
}
