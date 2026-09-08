import * as React from 'react'
import { View } from 'react-native'

import { MAX_KP_QUESTION_LENGTH } from '@/api/table-talk'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/i18n/t'
import { selectCanAskKp, useGameStore } from '@/stores/game'

export interface KpQuestionSheetProps {
  gameKey: string
  open: boolean
  onClose: () => void
}

/** 草稿按入局代次挂载，切局/身份切换时私密内容不会沿用。 */
export function KpQuestionSheet({ gameKey, open, onClose }: KpQuestionSheetProps) {
  const currentGame = useGameStore((state) => state.gameKey)
  const revision = useGameStore((state) => state.tableTalkRevision)
  const canAsk = useGameStore(selectCanAskKp)
  if (!open || gameKey !== currentGame || !canAsk) return null
  return <KpQuestionForm key={revision} onClose={onClose} />
}

function KpQuestionForm({ onClose }: Pick<KpQuestionSheetProps, 'onClose'>) {
  const t = useT()
  const busy = useGameStore((state) => state.kpQuestionBusy)
  const answer = useGameStore((state) => state.kpQuestionAnswer)
  const error = useGameStore((state) => state.kpQuestionError)
  const supported = useGameStore((state) => state.kpQuestionSupported)
  const [question, setQuestion] = React.useState('')
  const [shareWithParty, setShareWithParty] = React.useState(false)

  function close() {
    if (busy) return
    useGameStore.getState().clearKpQuestion()
    onClose()
  }

  return (
    <Sheet open onClose={close} className="h-auto">
      <View className="gap-4 pt-1">
        <View className="gap-2">
          <Text variant="h3">{t('kpQuestionTitle')}</Text>
          <Text variant="muted" className="leading-5">{t('kpQuestionBoundary')}</Text>
        </View>
        <View className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Text variant="small" className="font-semibold">{t('kpQuestionLabel')}</Text>
            <Text className="text-xs tabular-nums text-muted-foreground">{question.length} / {MAX_KP_QUESTION_LENGTH}</Text>
          </View>
          <Textarea
            value={question}
            onChangeText={(value) => {
              setQuestion(value)
              useGameStore.getState().clearKpQuestion()
            }}
            accessibilityLabel={t('kpQuestionLabel')}
            placeholder={t('kpQuestionPlaceholder')}
            maxLength={MAX_KP_QUESTION_LENGTH}
            editable={!busy && supported !== false}
            className="min-h-28"
          />
        </View>
        <View className="flex-row items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <Switch
            checked={shareWithParty}
            onCheckedChange={(checked) => {
              setShareWithParty(checked)
              useGameStore.getState().clearKpQuestion()
            }}
            disabled={busy || supported === false}
            accessibilityLabel={t('kpQuestionShare')}
            className="mt-1"
          />
          <View className="flex-1 gap-1">
            <Text variant="small" className="font-semibold">{t('kpQuestionShare')}</Text>
            <Text variant="muted" className="leading-5">
              {t(shareWithParty ? 'kpQuestionPartyBoundary' : 'kpQuestionPrivateBoundary')}
            </Text>
          </View>
        </View>
        {busy ? <Text accessibilityLiveRegion="polite" variant="muted">{t('kpQuestionAsking')}</Text> : null}
        {answer ? (
          <View accessibilityLiveRegion="polite" className="gap-2 border-l-2 border-primary bg-primary/5 p-3">
            <Text variant="small" className="font-semibold text-primary">{t('kpQuestionAnswer')}</Text>
            <Text selectable className="text-sm leading-6">{answer}</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" className="text-sm text-destructive">{error}</Text> : null}
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onPress={close}>
            <Text>{t('close')}</Text>
          </Button>
          <Button
            className="flex-1"
            disabled={busy || !question.trim() || supported === false}
            onPress={() => void useGameStore.getState().askKp(question, shareWithParty ? 'party' : 'private')}
          >
            <Text>{t(busy ? 'kpQuestionAsking' : 'kpQuestionSubmit')}</Text>
          </Button>
        </View>
      </View>
    </Sheet>
  )
}
