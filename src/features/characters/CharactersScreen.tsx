import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Plus, RefreshCw, Swords, UserRound } from 'lucide-react-native'

import { libraryAvatarSource } from '@/api/assets'
import type { CharacterCard } from '@/api/types'
import { PageHeader } from '@/components/page-header'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Sheet } from '@/components/patterns/sheet'
import { Screen } from '@/components/screen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import { CharacterCardEditor } from '@/features/characters/CharacterCardEditor'
import { useCharacters } from '@/hooks/useCharacters'
import { useT } from '@/i18n/t'
import type { CharacterCardPatch } from '@/lib/character-card'
import { confirmDestructive } from '@/lib/confirm'

function cardId(card: CharacterCard): string {
  return String(card.card_id || card.id || '')
}

export default function CharactersScreen() {
  const t = useT()
  const { cards, loading, error, refresh, addCard, updateCard, deleteCard } = useCharacters()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CharacterCard | null>(null)

  function openEditor(card?: CharacterCard) {
    setEditing(card ?? null)
    setSheetOpen(true)
  }

  function closeEditor() {
    setSheetOpen(false)
    setEditing(null)
  }

  async function submitCard(payload: CharacterCardPatch) {
    if (editing) await updateCard(cardId(editing), payload)
    else await addCard(payload)
  }

  async function removeCard(card: CharacterCard) {
    const ok = await confirmDestructive({
      title: t('dfCharacterDeleteTitle'),
      message: t('dfCharacterDeleteMessage', { name: card.character_name || t('dfCharacterUnnamed') }),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
    if (ok) await deleteCard(cardId(card))
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={t('dfCharacterRosterTitle')}
        subtitle={loading ? t('dfCharacterSyncing') : t('dfCharacterCardCount', { count: cards.length })}
        className="px-0"
        right={<Button size="sm" onPress={() => openEditor()}><Icon as={Plus} size={16} /><Text>{t('dfCharacterNew')}</Text></Button>}
      />
      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Icon as={RefreshCw} size={15} /><Text>{t('dfCommonRetry')}</Text></Button></View> : null}
      <View className="mb-3 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Swords} size={19} /></View>
        <View className="flex-1"><Text className="font-semibold">{t('dfCharacterCrossGameTitle')}</Text><Text variant="small">{t('dfCharacterCrossGameDesc')}</Text></View>
      </View>
      <FlatList
        data={cards}
        keyExtractor={(item) => cardId(item)}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void refresh()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Card className="gap-3 py-4">
            <CardContent className="flex-row items-center gap-3 px-4">
              <RemoteAvatar source={libraryAvatarSource(item.portrait)} name={String(item.character_name || '?')} className="h-11 w-11 rounded-full border border-border bg-muted" />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-semibold" numberOfLines={1}>{item.character_name || t('dfCharacterUnnamed')}</Text>
                {/* RN 里 Text 默认 flexShrink:0，不放 wrap/shrink 会在徽章过长时溢出到右侧按钮列下方 */}
                <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
                  <Badge variant="outline" className="max-w-full px-1.5 py-0"><Text className="shrink text-[10px]" numberOfLines={1}>{String(item.rule_name || item.rule_id || t('dfCharacterNoRule'))}</Text></Badge>
                  {[item.race, item.class].filter(Boolean).length ? (
                    <Text variant="small" className="shrink text-muted-foreground" numberOfLines={1}>
                      {[item.race, item.class].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {item.background ? <Text variant="small" numberOfLines={2}>{String(item.background)}</Text> : null}
              </View>
              <View className="gap-1">
                <Button size="sm" variant="ghost" onPress={() => openEditor(item)}><Text>{t('edit')}</Text></Button>
                <Button size="sm" variant="ghost" onPress={() => void removeCard(item)}><Text className="text-destructive">{t('dfCommonDelete')}</Text></Button>
              </View>
            </CardContent>
          </Card>
        )}
        ListEmptyComponent={
          loading ? (
            // 首拉骨架：消除「空白跳变 → 列表突现」
            <View className="gap-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </View>
          ) : (
            <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
              <Icon as={UserRound} size={28} className="text-muted-foreground" />
              <Text className="font-semibold">{t('dfCharacterEmptyTitle')}</Text>
              <Text variant="small">{t('dfCharacterEmptyDesc')}</Text>
            </View>
          )
        }
      />
      {sheetOpen ? (
        // 内容长（规则/头像/技能/背景/金钱），固定 85% 高并交给 Sheet 内部滚动，保证底部按钮可达
        <Sheet open onClose={closeEditor} className="h-[85%]">
          <CharacterCardEditor
            card={editing}
            onSubmit={submitCard}
            onClose={closeEditor}
          />
        </Sheet>
      ) : null}
    </Screen>
  )
}
