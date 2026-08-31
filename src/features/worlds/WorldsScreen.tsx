import * as React from 'react'
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native'
import { Globe2 } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { worldCoverSource } from '@/api/assets'
import type { GmStyle } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { SceneCover } from '@/components/patterns/scene-cover'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_GM_STYLE, languageLabel, useWorlds, type WorldGalleryCard } from '@/hooks/useWorlds'
import { useT, type T } from '@/i18n/t'
import { appLayoutForWidth } from '@/lib/layout'
import { confirmDestructive } from '@/lib/confirm'

/** 模块级常量只存 key，渲染时经 t() 取文案 */
const SOURCE_LABEL_KEYS = {
  builtin: 'dfWorldsSourceBuiltin',
  user: 'dfWorldsSourceUser',
  plugin: 'dfWorldsSourcePlugin',
} as const

const VERBOSITY_OPTIONS = [
  { labelKey: 'dfWorldsVerbosityBrief', value: 'brief' },
  { labelKey: 'dfWorldsVerbosityNormal', value: 'normal' },
  { labelKey: 'dfWorldsVerbosityDetailed', value: 'detailed' },
] as const

function cardMeta(card: WorldGalleryCard, t: T): string {
  return `${t(SOURCE_LABEL_KEYS[card.source])} · ${languageLabel(card.language)} · ${t('dfWorldsEntryCount', { count: card.lorebookCount })}`
}

export default function WorldsScreen() {
  const router = useRouter()
  const t = useT()
  const { width } = useWindowDimensions()
  const { gameListColumns: columns } = appLayoutForWidth(width)
  const { cards, loading, error, refresh, clone, remove, saveGmStyle } = useWorlds()

  const [previewCard, setPreviewCard] = React.useState<WorldGalleryCard | null>(null)
  const [tone, setTone] = React.useState('')
  const [verbosity, setVerbosity] = React.useState<GmStyle['verbosity']>('normal')
  const [customInstructions, setCustomInstructions] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState('')

  const shownError = actionError || error

  function openPreview(card: WorldGalleryCard) {
    setActionError('')
    setPreviewCard(card)
    setTone(card.gmStyle?.tone || '')
    setVerbosity(card.gmStyle?.verbosity || 'normal')
    setCustomInstructions(card.gmStyle?.custom_instructions || '')
  }

  function closePreview() {
    setPreviewCard(null)
    setActionError('')
  }

  function resetStyle() {
    setTone(DEFAULT_GM_STYLE.tone || '')
    setVerbosity(DEFAULT_GM_STYLE.verbosity || 'normal')
    setCustomInstructions(DEFAULT_GM_STYLE.custom_instructions || '')
  }

  function startGame(card: WorldGalleryCard) {
    // 直接进创建向导并预选该世界（原来绕道 /overview 打开创建抽屉）
    router.push({ pathname: '/create', params: { world: card.id } })
  }

  async function cloneCard(card: WorldGalleryCard) {
    setBusy(true)
    setActionError('')
    try {
      await clone(card)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('dfWorldsCloneFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function saveStyle() {
    if (!previewCard) return
    setBusy(true)
    setActionError('')
    try {
      await saveGmStyle(previewCard, { tone, verbosity, custom_instructions: customInstructions })
      closePreview()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('dfWorldsSaveStyleFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCard(card: WorldGalleryCard) {
    const confirmed = await confirmDestructive({
      title: t('dfWorldsDeleteTitle'),
      message: t('dfWorldsDeleteMessage', { name: card.name }),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
    setBusy(true)
    setActionError('')
    try {
      await remove(card)
      closePreview()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('dfWorldsDeleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  const canEditStyle = previewCard?.gmStyle != null

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={t('stepWorld')}
        subtitle={t('dfWorldsSubtitle')}
        onBack={() => router.back()}
        className="px-0"
      />

      {shownError ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="flex-1 text-destructive" numberOfLines={2}>{shownError}</Text>
          <Button size="sm" variant="outline" onPress={() => { setActionError(''); void refresh() }}>
            <Text>{t('dfCommonRetry')}</Text>
          </Button>
        </View>
      ) : null}

      <FlatList
        key={`world-grid-${columns}`}
        data={cards}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="pb-8"
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={() => void refresh()}
        renderItem={({ item }) => (
          <Pressable
            className={`mb-3 flex-1 ${columns > 1 ? 'mx-1.5' : ''}`}
            onPress={() => openPreview(item)}
          >
            <Card className="gap-0 overflow-hidden p-0">
              <View>
                <SceneCover
                  source={worldCoverSource(item.sceneImage, item.defaultRule)}
                  className="h-28 w-full"
                  accessibilityLabel={t('dfWorldsCoverA11y', { name: item.name })}
                />
                <View className="absolute left-2 top-2 flex-row flex-wrap gap-1.5">
                  <View className="rounded-full bg-black/55 px-2 py-0.5">
                    <Text variant="small" className="text-white">{t(SOURCE_LABEL_KEYS[item.source])}</Text>
                  </View>
                  {item.adventureName ? (
                    <View className="rounded-full bg-primary/90 px-2 py-0.5">
                      <Text variant="small" className="text-primary-foreground" numberOfLines={1}>
                        {t('dfWorldsAdventurePack', { name: item.adventureName })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <CardContent className="gap-2 px-4 py-3">
                <Text className="font-semibold" numberOfLines={1}>{item.name}</Text>
                {item.description ? (
                  <Text className="leading-5 text-muted-foreground" numberOfLines={2}>{item.description}</Text>
                ) : null}
                <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                  {languageLabel(item.language)} · {t('dfWorldsEntryCount', { count: item.lorebookCount })}
                </Text>
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  <Button size="sm" onPress={() => startGame(item)}>
                    <Text>{t('dfWorldsActionUse')}</Text>
                  </Button>
                  <Button size="sm" variant="outline" onPress={() => openPreview(item)}>
                    <Text>{t('dfWorldsActionPreview')}</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || item.source === 'user'}
                    onPress={() => void cloneCard(item)}
                  >
                    <Text>{t('dfWorldsActionClone')}</Text>
                  </Button>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={Globe2} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{t('dfWorldsEmptyTitle')}</Text>
            <Text variant="small">{t('dfWorldsEmptyDesc')}</Text>
          </View>
        ) : null}
      />

      <Sheet open={previewCard !== null} onClose={closePreview} className="h-[85%]">
        {previewCard ? (
          <View className="gap-4 pt-1">
            <View className="gap-1">
              <Text variant="h3" numberOfLines={1}>{previewCard.name}</Text>
              <Text variant="small">{cardMeta(previewCard, t)}</Text>
            </View>
            {previewCard.description ? (
              <Text className="leading-6 text-muted-foreground">{previewCard.description}</Text>
            ) : null}

            <View className="gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <Text className="font-semibold">{t('dfWorldsGmStyle')}</Text>
              {canEditStyle ? (
                <View className="gap-3">
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">{t('dfWorldsStyleTone')}</Text>
                    <Input
                      value={tone}
                      onChangeText={setTone}
                      maxLength={120}
                      placeholder={t('dfWorldsTonePlaceholder')}
                    />
                    <Text variant="small" className="text-muted-foreground">
                      {t('dfWorldsStyleToneHint')}
                    </Text>
                  </View>
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">{t('dfWorldsStyleVerbosity')}</Text>
                    <SheetSelect
                      options={VERBOSITY_OPTIONS.map((option) => ({ label: t(option.labelKey), value: option.value }))}
                      value={verbosity || 'normal'}
                      onValueChange={(value) => setVerbosity(value as GmStyle['verbosity'])}
                      placeholder={t('dfWorldsVerbosityPlaceholder')}
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">{t('dfWorldsStyleCustom')}</Text>
                    <Textarea
                      value={customInstructions}
                      onChangeText={setCustomInstructions}
                      maxLength={2000}
                      placeholder={t('dfWorldsCustomPlaceholder')}
                      className="min-h-24"
                    />
                    <Text variant="small" className="text-muted-foreground">
                      {t('dfWorldsCustomHint')}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <Button variant="outline" className="flex-1" disabled={busy} onPress={resetStyle}>
                      <Text>{t('dfWorldsStyleReset')}</Text>
                    </Button>
                    <Button className="flex-1" disabled={busy} onPress={() => void saveStyle()}>
                      <Text>{busy ? t('dfWorldsStyleSaving') : t('dfWorldsStyleSave')}</Text>
                    </Button>
                  </View>
                </View>
              ) : (
                <Text variant="small" className="leading-5 text-muted-foreground">
                  {t('dfWorldsStyleLocked')}
                </Text>
              )}
            </View>

            {previewCard.source === 'user' ? (
              <Button variant="destructive" disabled={busy} onPress={() => void deleteCard(previewCard)}>
                <Text>{t('dfWorldsActionDelete')}</Text>
              </Button>
            ) : null}

            {actionError ? <Text className="text-destructive">{actionError}</Text> : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}
