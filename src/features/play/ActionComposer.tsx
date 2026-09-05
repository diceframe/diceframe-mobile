import * as React from 'react'
import { Keyboard as NativeKeyboard, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { Keyboard, Mic, Send } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { appendActionText } from '@/lib/action-text'
import { cn } from '@/lib/utils'
import { voiceGestureTarget, voiceOverlayLayout } from '@/lib/voice-gesture'
import { VoiceInputOverlay } from './VoiceInputOverlay'
import type { VoiceInputState } from './useVoiceInput'

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
  const [voiceMode, setVoiceMode] = React.useState(false)
  const gestureRef = React.useRef(false)
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const gestureLayout = voiceOverlayLayout(width, height, insets.bottom)
  const holding = !!voice?.recording || !!voice?.preparing
  const voiceActive = holding || !!voice?.busy || voice?.reviewText != null

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
              onPress={() => {
                onChangeText(appendActionText(value, action))
                setVoiceMode(false)
              }}
              disabled={locked || voiceActive}
              className={cn(
                'rounded-full border border-border bg-muted px-3 py-1 active:bg-accent',
                (locked || voiceActive) && 'opacity-50',
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
            onPress={() => {
              NativeKeyboard.dismiss()
              setVoiceMode(!voiceMode)
            }}
            disabled={voiceActive || locked}
            accessibilityLabel={voiceMode ? t('dfPlayKeyboardInput') : t('asrVoice')}
            className={cn(
              'h-12 w-12 shrink-0 items-center justify-center rounded-full border border-input bg-background',
              (voiceActive || locked) && 'opacity-50',
            )}
          >
            <Icon as={voiceMode ? Keyboard : Mic} size={20} className="text-muted-foreground" />
          </Pressable>
        ) : null}

        {voiceMode && voice?.available ? (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={t('dfPlayRecordStart')}
            accessibilityHint={t('dfPlayRecordingHint')}
            accessibilityState={{ disabled: locked || voice.busy }}
            onStartShouldSetResponder={() => !locked && !voiceActive}
            onResponderGrant={() => {
              gestureRef.current = true
              voice.onPressIn()
            }}
            onResponderMove={(event) => {
              if (!gestureRef.current) return
              voice.onTargetChange(voiceGestureTarget(event.nativeEvent.pageX, event.nativeEvent.pageY, gestureLayout))
            }}
            onResponderRelease={(event) => {
              if (!gestureRef.current) return
              gestureRef.current = false
              voice.onPressOut(voiceGestureTarget(event.nativeEvent.pageX, event.nativeEvent.pageY, gestureLayout))
            }}
            onResponderTerminationRequest={() => false}
            onResponderTerminate={() => {
              gestureRef.current = false
              voice.onCancel()
            }}
            className={cn(
              'min-h-12 flex-1 items-center justify-center rounded-md border border-input bg-muted px-3',
              holding && 'border-primary bg-primary',
              (locked || voice.busy) && 'opacity-50',
            )}
          >
            <Text className={cn('font-medium', holding && 'text-primary-foreground')}>
              {t('dfPlayRecordStart')}
            </Text>
          </View>
        ) : (
          <Textarea
            value={value}
            onChangeText={onChangeText}
            placeholder={t('actionPlaceholder')}
            className="min-h-12 flex-1"
            editable={!locked}
            multiline
          />
        )}

        {!voiceMode ? (
          <Button
            size="icon"
            onPress={onSend}
            disabled={locked || voiceActive || !value.trim()}
            accessibilityLabel={t('send')}
            className="h-12 w-12 shrink-0"
          >
            <Icon as={Send} size={18} />
          </Button>
        ) : null}
      </View>

      {disabledReason ? <Text variant="small" className="px-3">{disabledReason}</Text> : null}
      {voice ? <VoiceInputOverlay voice={voice} /> : null}
    </View>
  )
}
