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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { CharacterCardEditor } from '@/features/characters/CharacterCardEditor'
import { useCharacters } from '@/hooks/useCharacters'
import { cachedCharacterSchema, cachedRuleLibrary, useLocalCards, type LocalCardView } from '@/hooks/useLocalCards'
import { useT } from '@/i18n/t'
import type { CharacterCardPatch } from '@/lib/character-card'
import type { EditorSnapshot } from '@/lib/local-library/card-edit'
import { confirmDestructive } from '@/lib/confirm'

type LibraryTab = 'local' | 'server'

function cardId(card: CharacterCard): string {
  return String(card.card_id || card.id || '')
}

/** 列表卡片：头像 + 名字 + 规则徽章 + 出身职业 + 背景摘要，右侧操作按钮 */
function CardRow({
  card,
  badges,
  actions,
}: {
  card: CharacterCard
  badges?: React.ReactNode
  actions: React.ReactNode
}) {
  const t = useT()
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex-row items-center gap-3 px-4">
        <RemoteAvatar source={libraryAvatarSource(card.portrait)} name={String(card.character_name || '?')} className="h-11 w-11 rounded-full border border-border bg-muted" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold" numberOfLines={1}>{card.character_name || t('dfCharacterUnnamed')}</Text>
          {/* RN 里 Text 默认 flexShrink:0，不放 wrap/shrink 会在徽章过长时溢出到右侧按钮列下方 */}
          <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
            <Badge variant="outline" className="max-w-full px-1.5 py-0"><Text className="shrink text-[10px]" numberOfLines={1}>{String(card.rule_name || card.rule_id || t('dfCharacterNoRule'))}</Text></Badge>
            {badges}
            {[card.race, card.class].filter(Boolean).length ? (
              <Text variant="small" className="shrink text-muted-foreground" numberOfLines={1}>
                {[card.race, card.class].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {card.background ? <Text variant="small" numberOfLines={2}>{String(card.background)}</Text> : null}
        </View>
        <View className="gap-1">{actions}</View>
      </CardContent>
    </Card>
  )
}

function ListSkeleton() {
  return (
    <View className="gap-2">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </View>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
      <Icon as={UserRound} size={28} className="text-muted-foreground" />
      <Text className="font-semibold">{title}</Text>
      <Text variant="small" className="text-center">{description}</Text>
    </View>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT()
  return (
    <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
      <Text className="flex-1 text-destructive" numberOfLines={2}>{message}</Text>
      <Button size="sm" variant="outline" onPress={onRetry}><Icon as={RefreshCw} size={15} /><Text>{t('dfCommonRetry')}</Text></Button>
    </View>
  )
}

type EditorTarget =
  | { tab: 'server'; card: CharacterCard | null }
  | { tab: 'local'; card: LocalCardView | null }

/**
 * 角色页：本机角色库（离线内容库，默认）与服务器卡库（房主的共享卡库，在线 CRUD）。
 * Web 端没有本机库，只显示服务器卡库。
 */
export default function CharactersScreen() {
  const t = useT()
  const server = useCharacters()
  const local = useLocalCards()
  const localAvailable = local.cards !== null
  const [tab, setTab] = React.useState<LibraryTab>('local')
  const activeTab: LibraryTab = localAvailable ? tab : 'server'
  const [editor, setEditor] = React.useState<EditorTarget | null>(null)

  async function submitCard(payload: CharacterCardPatch, snapshot: EditorSnapshot) {
    if (!editor) return
    if (editor.tab === 'server') {
      if (editor.card) await server.updateCard(cardId(editor.card), payload)
      else await server.addCard(payload)
    } else if (editor.card) {
      await local.updateCard(editor.card.localId, payload, snapshot)
    } else {
      await local.addCard(payload)
    }
  }

  async function confirmDelete(name: string | undefined): Promise<boolean> {
    return confirmDestructive({
      title: t('dfCharacterDeleteTitle'),
      message: t('dfCharacterDeleteMessage', { name: name || t('dfCharacterUnnamed') }),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
  }

  const subtitle = activeTab === 'local'
    ? (local.loading ? t('dfCharacterSyncing') : t('dfLocalCardCount', { count: local.cards?.length ?? 0 }))
    : (server.loading ? t('dfCharacterSyncing') : t('dfCharacterCardCount', { count: server.cards.length }))

  const serverList = (
    <View className="min-h-0 flex-1">
      {server.error ? <ErrorBanner message={server.error} onRetry={() => void server.refresh()} /> : null}
      <View className="mb-3 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Swords} size={19} /></View>
        <View className="flex-1"><Text className="font-semibold">{t('dfCharacterCrossGameTitle')}</Text><Text variant="small">{t('dfCharacterCrossGameDesc')}</Text></View>
      </View>
      <FlatList
        data={server.cards}
        keyExtractor={(item) => cardId(item)}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={server.loading}
        onRefresh={() => void server.refresh()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CardRow
            card={item}
            actions={(
              <>
                <Button size="sm" variant="ghost" onPress={() => setEditor({ tab: 'server', card: item })}><Text>{t('edit')}</Text></Button>
                <Button size="sm" variant="ghost" onPress={() => void (async () => { if (await confirmDelete(item.character_name)) await server.deleteCard(cardId(item)) })()}>
                  <Text className="text-destructive">{t('dfCommonDelete')}</Text>
                </Button>
              </>
            )}
          />
        )}
        ListEmptyComponent={server.loading ? <ListSkeleton /> : <EmptyState title={t('dfCharacterEmptyTitle')} description={t('dfCharacterEmptyDesc')} />}
      />
    </View>
  )

  const localList = (
    <View className="min-h-0 flex-1">
      {local.error ? <ErrorBanner message={local.error} onRetry={() => void local.refresh()} /> : null}
      <FlatList
        data={local.cards ?? []}
        keyExtractor={(item) => item.localId}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={local.loading}
        onRefresh={() => void local.refresh()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CardRow
            card={item.body}
            badges={item.readOnly ? (
              <Badge variant="secondary" className="px-1.5 py-0"><Text className="text-[10px]">{t('dfLocalCardReadOnly')}</Text></Badge>
            ) : null}
            actions={(
              <>
                {item.readOnly ? null : (
                  <Button size="sm" variant="ghost" onPress={() => setEditor({ tab: 'local', card: item })}><Text>{t('edit')}</Text></Button>
                )}
                <Button size="sm" variant="ghost" onPress={() => void local.duplicateCard(item.localId)}><Text>{t('dfLocalCardDuplicate')}</Text></Button>
                <Button size="sm" variant="ghost" onPress={() => void (async () => { if (await confirmDelete(item.body.character_name)) await local.deleteCard(item.localId) })()}>
                  <Text className="text-destructive">{t('dfCommonDelete')}</Text>
                </Button>
              </>
            )}
          />
        )}
        ListFooterComponent={(local.cards ?? []).some((card) => card.readOnly)
          ? <Text variant="small" className="px-1 text-muted-foreground">{t('dfLocalCardReadOnlyHint')}</Text>
          : null}
        ListEmptyComponent={local.loading ? <ListSkeleton /> : <EmptyState title={t('dfLocalEmptyTitle')} description={t('dfLocalEmptyDesc')} />}
      />
    </View>
  )

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={t('dfCharacterRosterTitle')}
        subtitle={subtitle}
        className="px-0"
        right={<Button size="sm" onPress={() => setEditor({ tab: activeTab, card: null } as EditorTarget)}><Icon as={Plus} size={16} /><Text>{t('dfCharacterNew')}</Text></Button>}
      />
      {localAvailable ? (
        <Tabs value={activeTab} onValueChange={(value) => setTab(value as LibraryTab)} className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="local"><Text variant="small">{t('dfLocalLibraryTab')}</Text></TabsTrigger>
            <TabsTrigger value="server"><Text variant="small">{t('dfServerLibraryTab')}</Text></TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="min-h-0 flex-1 pt-3">{localList}</TabsContent>
          <TabsContent value="server" className="min-h-0 flex-1 pt-3">{serverList}</TabsContent>
        </Tabs>
      ) : serverList}
      {editor ? (
        // 内容长（规则/头像/技能/背景/金钱），固定 85% 高并交给 Sheet 内部滚动，保证底部按钮可达
        <Sheet open onClose={() => setEditor(null)} className="h-[85%]">
          {editor.tab === 'local' ? (
            <CharacterCardEditor
              card={editor.card?.body ?? null}
              editing={!!editor.card}
              ruleLibrarySource={cachedRuleLibrary}
              schemaSource={cachedCharacterSchema}
              onSubmit={submitCard}
              onClose={() => setEditor(null)}
            />
          ) : (
            <CharacterCardEditor card={editor.card} onSubmit={submitCard} onClose={() => setEditor(null)} />
          )}
        </Sheet>
      ) : null}
    </Screen>
  )
}
