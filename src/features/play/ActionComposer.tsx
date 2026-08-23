import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Mic, Send } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { strings } from '@/lib/strings'
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
  quickActions,
  voice,
}: {
  value: string
  onChangeText: (text: string) => void
  onSend: () => void
  busy: boolean
  quickActions: string[]
  voice?: VoiceInputState
}) {
  return (
    <View className="gap-2 px-3 pb-2">
      {quickActions.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {quickActions.map((action) => (
            <Pressable
              key={action}
              onPress={() => onChangeText(value ? `${value} ${action}` : action)}
              className="rounded-full border border-border bg-muted px-3 py-1 active:bg-accent"
            >
              <Text className="text-sm text-muted-foreground">{action}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View className="flex-row items-end gap-2">
        {voice?.available ? (
          <Pressable
            onPress={voice.onToggle}
            disabled={voice.busy}
            accessibilityLabel={voice.recording ? strings.play.recordStop : strings.play.recordStart}
            className={cn(
              'h-12 w-12 shrink-0 items-center justify-center rounded-full',
              voice.recording ? 'bg-destructive' : 'border border-input bg-background',
              voice.busy && 'opacity-50',
            )}
          >
            <Mic
              size={20}
              className={voice.recording ? 'text-destructive-foreground' : 'text-muted-foreground'}
            />
          </Pressable>
        ) : null}

        <Textarea
          value={value}
          onChangeText={onChangeText}
          placeholder={strings.play.actionPlaceholder}
          className="min-h-12 flex-1"
          editable={!busy}
          multiline
        />

        <Button
          size="icon"
          onPress={onSend}
          disabled={busy || !value.trim()}
          accessibilityLabel={strings.play.send}
          className="h-12 w-12 shrink-0"
        >
          <Send size={18} className="text-primary-foreground" />
        </Button>
      </View>

      {voice?.error ? <Text className="text-destructive">{voice.error}</Text> : null}
      {voice?.recording ? (
        <Text variant="small" className="text-destructive">
          录音中…再次点击结束并识别
        </Text>
      ) : null}
    </View>
  )
}
