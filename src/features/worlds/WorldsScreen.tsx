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
import { appLayoutForWidth } from '@/lib/layout'
import { confirmDestructive } from '@/lib/confirm'

const SOURCE_LABELS: Record<WorldGalleryCard['source'], string> = {
  builtin: '内置',
  user: '自建',
  plugin: '插件',
}

const VERBOSITY_OPTIONS = [
  { label: '从简', value: 'brief' },
  { label: '默认', value: 'normal' },
  { label: '详尽', value: 'detailed' },
]

function cardMeta(card: WorldGalleryCard): string {
  return `${SOURCE_LABELS[card.source]} · ${languageLabel(card.language)} · ${card.lorebookCount} 个世界书条目`
}

export default function WorldsScreen() {
  const router = useRouter()
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
    router.push({ pathname: '/overview', params: { world: card.id, create: '1' } })
  }

  async function cloneCard(card: WorldGalleryCard) {
    setBusy(true)
    setActionError('')
    try {
      await clone(card)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '克隆世界失败')
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
      setActionError(cause instanceof Error ? cause.message : '保存 GM 风格失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteCard(card: WorldGalleryCard) {
    const confirmed = await confirmDestructive({
      title: '删除世界？',
      message: `确定删除「${card.name}」？其世界书条目将一并删除，且无法恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return
    setBusy(true)
    setActionError('')
    try {
      await remove(card)
      closePreview()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '删除世界失败')
    } finally {
      setBusy(false)
    }
  }

  const canEditStyle = previewCard?.gmStyle != null

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title="世界"
        subtitle="世界画廊 · 浏览内置与自建世界，一键开团或克隆后自定义 GM 风格"
        onBack={() => router.back()}
        className="px-0"
      />

      {shownError ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="flex-1 text-destructive" numberOfLines={2}>{shownError}</Text>
          <Button size="sm" variant="outline" onPress={() => { setActionError(''); void refresh() }}>
            <Text>重试</Text>
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
                  accessibilityLabel={`${item.name}封面`}
                />
                <View className="absolute left-2 top-2 flex-row flex-wrap gap-1.5">
                  <View className="rounded-full bg-black/55 px-2 py-0.5">
                    <Text variant="small" className="text-white">{SOURCE_LABELS[item.source]}</Text>
                  </View>
                  {item.adventureName ? (
                    <View className="rounded-full bg-primary/90 px-2 py-0.5">
                      <Text variant="small" className="text-primary-foreground" numberOfLines={1}>
                        冒险包：{item.adventureName}
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
                  {languageLabel(item.language)} · {item.lorebookCount} 个世界书条目
                </Text>
                <View className="flex-row flex-wrap gap-1.5 pt-1">
                  <Button size="sm" onPress={() => startGame(item)}>
                    <Text>用它开团</Text>
                  </Button>
                  <Button size="sm" variant="outline" onPress={() => openPreview(item)}>
                    <Text>预览</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || item.source === 'user'}
                    onPress={() => void cloneCard(item)}
                  >
                    <Text>克隆为我的世界</Text>
                  </Button>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={Globe2} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">还没有可浏览的世界</Text>
            <Text variant="small">服务器返回的世界会显示在这里，下拉可刷新。</Text>
          </View>
        ) : null}
      />

      <Sheet open={previewCard !== null} onClose={closePreview} className="h-[85%]">
        {previewCard ? (
          <View className="gap-4 pt-1">
            <View className="gap-1">
              <Text variant="h3" numberOfLines={1}>{previewCard.name}</Text>
              <Text variant="small">{cardMeta(previewCard)}</Text>
            </View>
            {previewCard.description ? (
              <Text className="leading-6 text-muted-foreground">{previewCard.description}</Text>
            ) : null}

            <View className="gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <Text className="font-semibold">GM 叙事风格</Text>
              {canEditStyle ? (
                <View className="gap-3">
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">叙事口吻</Text>
                    <Input
                      value={tone}
                      onChangeText={setTone}
                      maxLength={120}
                      placeholder="例如：严肃哥特"
                    />
                    <Text variant="small" className="text-muted-foreground">
                      简述你想要的口吻，留空使用默认。
                    </Text>
                  </View>
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">叙述详略</Text>
                    <SheetSelect
                      options={VERBOSITY_OPTIONS}
                      value={verbosity || 'normal'}
                      onValueChange={(value) => setVerbosity(value as GmStyle['verbosity'])}
                      placeholder="选择叙述详略"
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text variant="small" className="font-semibold">附加指令</Text>
                    <Textarea
                      value={customInstructions}
                      onChangeText={setCustomInstructions}
                      maxLength={2000}
                      placeholder="追加到 GM prompt 末尾的风格指令…"
                      className="min-h-24"
                    />
                    <Text variant="small" className="text-muted-foreground">
                      仅调整叙事风格，不会覆盖规则与机制判定。
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <Button variant="outline" className="flex-1" disabled={busy} onPress={resetStyle}>
                      <Text>重置</Text>
                    </Button>
                    <Button className="flex-1" disabled={busy} onPress={() => void saveStyle()}>
                      <Text>{busy ? '保存中…' : '保存风格'}</Text>
                    </Button>
                  </View>
                </View>
              ) : (
                <Text variant="small" className="leading-5 text-muted-foreground">
                  内置或插件世界只读；请先「克隆为我的世界」，再自定义 GM 叙事风格。
                </Text>
              )}
            </View>

            {previewCard.source === 'user' ? (
              <Button variant="destructive" disabled={busy} onPress={() => void deleteCard(previewCard)}>
                <Text>删除世界</Text>
              </Button>
            ) : null}

            {actionError ? <Text className="text-destructive">{actionError}</Text> : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}
