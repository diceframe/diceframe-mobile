import * as React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Download, X } from 'lucide-react-native'

import { errorMessage } from '@/api/client'
import { exportPlayerFinale, fetchPlayerFinale } from '@/api/games'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { RUN_FINALE_FILENAMES, type PlayerFinale, type PlayerFinaleIdentity, type RunFinaleExportKind } from '@/lib/run-finale'
import { shareExportBlob } from '@/lib/share-export'

type LoadState = { finale: PlayerFinale; error?: never } | { error: string; finale?: never }
const exportLabels = { recap: 'dfFinaleExportRecap', character: 'dfFinaleExportCharacter' } as const

/** 由游玩页按本局 run、归档版本和席位挂载；退出即丢弃投影并取消请求。 */
export function RunFinaleSheet({ gameKey, identity, isCurrent, onClose }: {
  gameKey: string
  identity: PlayerFinaleIdentity
  isCurrent: () => boolean
  onClose: () => void
}) {
  const t = useT()
  const { runId, finaleId, revision } = identity
  const [load, setLoad] = React.useState<LoadState | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [exporting, setExporting] = React.useState<RunFinaleExportKind | null>(null)
  const [exportError, setExportError] = React.useState('')
  const exportRequest = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const request = new AbortController()
    if (!isCurrent()) {
      void Promise.resolve().then(() => {
        if (!request.signal.aborted) setLoad({ error: t('dfFinaleUnavailable') })
      })
    } else {
      fetchPlayerFinale(gameKey, { runId, finaleId, revision }, request.signal)
        .then((finale) => {
          if (!request.signal.aborted && isCurrent()) setLoad({ finale })
        })
        .catch((cause: unknown) => {
          if (!request.signal.aborted) setLoad({ error: errorMessage(cause, 'dfFinaleUnavailable') })
        })
    }
    return () => request.abort()
  }, [gameKey, runId, finaleId, revision, attempt])

  React.useEffect(() => () => exportRequest.current?.abort(), [])

  async function download(kind: RunFinaleExportKind) {
    if (!load?.finale || (kind === 'character' && !load.finale.hasCharacter) || exportRequest.current || !isCurrent()) return
    const request = new AbortController()
    exportRequest.current = request
    setExporting(kind)
    setExportError('')
    try {
      const bytes = await exportPlayerFinale(gameKey, kind, request.signal)
      // 下载期间可能换席位或退出。不能把上一身份的文件交给新身份的界面。
      if (request.signal.aborted || !isCurrent()) return
      await shareExportBlob(bytes, RUN_FINALE_FILENAMES[kind], t(exportLabels[kind]))
    } catch (cause) {
      if (!request.signal.aborted) setExportError(errorMessage(cause, 'dfFinaleExportFailed'))
    } finally {
      exportRequest.current = null
      if (!request.signal.aborted) setExporting(null)
    }
  }

  return (
    <Sheet open onClose={onClose}>
      <View className="gap-4 py-2">
        <View className="flex-row items-start gap-2">
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="h3">{t('dfFinaleTitle')}</Text>
            <Text variant="small" className="text-muted-foreground">{t('dfFinaleArchiveHint')}</Text>
          </View>
          <Button variant="ghost" size="icon" accessibilityLabel={t('close')} onPress={onClose}>
            <Icon as={X} size={20} />
          </Button>
        </View>
        {!load ? (
          <ActivityIndicator accessibilityLabel={t('dfCommonLoading')} className="self-start text-primary" />
        ) : load.error ? (
          <View className="gap-2">
            <Text variant="small" className="text-destructive" accessibilityRole="alert">{load.error}</Text>
            <Button variant="outline" size="sm" className="self-start" onPress={() => { setLoad(null); setAttempt((n) => n + 1) }}>
              <Text>{t('retry')}</Text>
            </Button>
          </View>
        ) : load.finale ? (
          <>
            <View className="flex-row flex-wrap gap-2">
              {(['recap', 'character'] as const).filter((kind) => kind === 'recap' || load.finale?.hasCharacter).map((kind) => (
                <Button key={kind} variant="outline" disabled={exporting !== null} onPress={() => void download(kind)}>
                  {exporting === kind ? <ActivityIndicator className="text-foreground" /> : <Icon as={Download} size={16} />}
                  <Text>{t(exportLabels[kind])}</Text>
                </Button>
              ))}
            </View>
            {exportError ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{exportError}</Text> : null}
            <View className="gap-2 rounded-xl border border-border bg-muted/30 p-3">
              <Text variant="h4">{t('dfFinaleEpilogue')}</Text>
              <Text selectable className="leading-6">{load.finale.epilogue}</Text>
            </View>
            <View className="gap-2 rounded-xl border border-border bg-muted/30 p-3">
              <Text variant="h4">{t('dfFinaleRecap')}</Text>
              <Text selectable className="leading-6">{load.finale.recap}</Text>
            </View>
          </>
        ) : null}
      </View>
    </Sheet>
  )
}
