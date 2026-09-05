import * as React from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Portal } from '@rn-primitives/portal'
import { Check, CircleDot, Mic, Undo2, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { THEME, useThemeToken } from '@/lib/theme'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'
import { recordingTime, recordingWaveform, voiceOverlayLayout } from '@/lib/voice-gesture'
import { cn } from '@/lib/utils'
import { voicePresentation } from '@/lib/voice-presentation'
import type { VoiceInputState } from './useVoiceInput'

/** 持续手势期间用不抢触摸的 Portal；松手后的编辑才打开原生 Modal。 */
export function VoiceInputOverlay({ voice }: { voice: VoiceInputState }) {
  const t = useT()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const foreground = useThemeToken('primaryForeground')
  const layout = voiceOverlayLayout(width, height, insets.bottom)
  const holding = voice.recording || voice.preparing
  const presentation = voicePresentation(voice)
  const visible = presentation === 'recording'
  const cancelled = voice.target === 'cancel'
  const bars = recordingWaveform(voice.metering)

  React.useEffect(() => {
    if (!visible) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      voice.onDismiss()
      return true
    })
    return () => subscription.remove()
  }, [visible, voice.onDismiss])

  const releaseLabel = cancelled ? t('dfPlayRecordCancelRelease')
    : voice.target === 'edit' ? t('dfPlayRecordEditRelease') : t('dfPlayRecordRelease')

  return (
    <>
      {visible ? (
        <Portal name="diceframe-voice-recording">
          <View
            pointerEvents={holding ? 'none' : 'auto'}
            className="absolute inset-0"
            accessibilityViewIsModal
          >
            {/* 原生端不支持给完整 hex 变量附加 Tailwind /opacity，遮罩单独设透明度。 */}
            <View className="absolute inset-0" style={{ backgroundColor: THEME.dark.background, opacity: 0.78 }} />
            <View
              className="absolute inset-x-0 items-center px-6"
              style={{ top: height * 0.41 }}
            >
              <View
                className={cn(
                  'min-h-24 items-center justify-center gap-2 rounded-xl px-4 py-3',
                  cancelled && holding ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: Math.min(width * 0.44, 220) }}
              >
                {voice.busy || voice.preparing ? (
                  <>
                    <ActivityIndicator size="large" color={foreground} />
                    <Text className="text-center text-base text-primary-foreground">
                      {voice.preparing ? t('preparing') : t('asrTranscribing')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className={cn('text-3xl font-semibold tabular-nums', cancelled ? 'text-destructive-foreground' : 'text-primary-foreground')}>
                      {recordingTime(voice.durationMillis)}
                    </Text>
                    <View className="h-9 flex-row items-center justify-center gap-1">
                      {bars.map((bar, index) => (
                        <View key={index} className={cn('w-0.5 rounded-full', cancelled ? 'bg-destructive-foreground' : 'bg-primary-foreground')} style={{ height: bar }} />
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>

            {holding ? (
              <>
                {(['cancel', 'send', 'edit'] as const).map((target) => {
                  const point = layout[target]
                  const selected = voice.target === target
                  return (
                    <View
                      key={target}
                      className={cn(
                        'absolute items-center justify-center rounded-full',
                        selected && target === 'cancel' ? 'bg-destructive'
                          : selected && target === 'edit' ? 'bg-primary' : 'bg-secondary',
                      )}
                      style={{
                        left: point.x - layout.radius,
                        top: point.y - layout.radius,
                        width: layout.radius * 2,
                        height: layout.radius * 2,
                        transform: [{ scale: selected ? 1.12 : 1 }],
                      }}
                    >
                      {target === 'edit' ? (
                        <Text className={cn('text-3xl font-medium', selected ? 'text-primary-foreground' : 'text-secondary-foreground')}>{t('dfPlayVoiceTextSymbol')}</Text>
                      ) : (
                        <Icon as={target === 'cancel' ? X : CircleDot} size={30} className={selected && target === 'cancel' ? 'text-destructive-foreground' : 'text-secondary-foreground'} />
                      )}
                    </View>
                  )
                })}
                <View className="absolute inset-x-0 items-center" style={{ bottom: layout.baseHeight + 6 }}>
                  <Text className="text-lg font-medium text-primary-foreground">{releaseLabel}</Text>
                </View>
                <View
                  className={cn('absolute items-center', cancelled ? 'bg-destructive' : 'bg-primary')}
                  style={{
                    width: width * 1.4,
                    height: layout.baseHeight + 80,
                    left: -width * 0.2,
                    bottom: -80,
                    borderTopLeftRadius: width * 0.7,
                    borderTopRightRadius: width * 0.7,
                    paddingTop: 40,
                  }}
                >
                  <Icon as={Mic} size={36} className={cancelled ? 'text-destructive-foreground' : 'text-primary-foreground'} />
                </View>
              </>
            ) : !voice.sending ? (
              <Pressable
                accessibilityLabel={t('cancel')}
                onPress={voice.onDismiss}
                className="absolute h-16 w-16 items-center justify-center rounded-full bg-secondary"
                style={{ left: width / 2 - 32, top: layout.cancel.y - 32 }}
              >
                <Icon as={X} size={30} className="text-secondary-foreground" />
              </Pressable>
            ) : null}
          </View>
        </Portal>
      ) : null}
      {presentation === 'review' ? <VoiceTextReview voice={voice} /> : null}
    </>
  )
}

function VoiceTextReview({ voice }: { voice: VoiceInputState }) {
  const t = useT()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardHeight()
  const foreground = useThemeToken('primaryForeground')
  const [editing, setEditing] = React.useState(false)
  const editorRef = React.useRef<TextInput | null>(null)
  const usableHeight = height - keyboardHeight - insets.top - insets.bottom

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={voice.onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1">
        <Pressable
          className="absolute inset-0"
          onPress={Keyboard.dismiss}
          style={{ backgroundColor: THEME.dark.background, opacity: 0.78 }}
        />
        <View
          className="absolute self-center"
          style={{
            top: insets.top + usableHeight * (keyboardHeight ? 0.12 : 0.34),
            width: Math.min(width - 40, 640),
          }}
        >
          <Pressable
            onPress={() => {
              if (voice.sending) return
              setEditing(true)
              requestAnimationFrame(() => editorRef.current?.focus())
            }}
            disabled={voice.sending || editing}
            accessibilityLabel={t('dfPlayVoiceEdit')}
            className="min-h-24 rounded-xl bg-primary px-5 py-4"
          >
            {editing ? (
              <TextInput
                ref={editorRef}
                autoFocus
                multiline
                scrollEnabled
                value={voice.reviewText ?? ''}
                onChangeText={voice.onReviewChange}
                editable={!voice.sending}
                accessibilityLabel={t('dfPlayVoiceEdit')}
                className="min-h-16 text-xl leading-8 text-primary-foreground"
                style={{ maxHeight: Math.max(100, usableHeight * 0.4), textAlignVertical: 'top' }}
                selectionColor={foreground}
              />
            ) : (
              <Text className="text-xl font-medium leading-8 text-primary-foreground" numberOfLines={8}>
                {voice.reviewText}
              </Text>
            )}
          </Pressable>
          {voice.error ? <Text className="mt-3 text-base text-primary-foreground">{voice.error}</Text> : null}
        </View>

        <View
          className="absolute inset-x-0 flex-row items-center justify-between px-12"
          style={{ bottom: keyboardHeight ? keyboardHeight + 16 : insets.bottom + height * 0.15 }}
        >
          <Pressable
            onPress={voice.onDismiss}
            disabled={voice.sending}
            accessibilityLabel={t('dfPlayVoiceDiscard')}
            className={cn('h-16 w-16 items-center justify-center rounded-full bg-secondary', voice.sending && 'opacity-50')}
          >
            <Icon as={Undo2} size={30} className="text-secondary-foreground" />
          </Pressable>
          <Pressable
            onPress={() => {
              Keyboard.dismiss()
              voice.onReviewSend()
            }}
            disabled={voice.sending || !voice.reviewText?.trim()}
            accessibilityLabel={t('dfPlayVoiceConfirmSend')}
            className={cn(
              'h-20 w-20 items-center justify-center rounded-full bg-primary-foreground',
              (voice.sending || !voice.reviewText?.trim()) && 'opacity-50',
            )}
          >
            {voice.sending ? <ActivityIndicator size="large" /> : <Icon as={Check} size={38} className="text-primary" />}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
