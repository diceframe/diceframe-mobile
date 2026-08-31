import * as React from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { BookMarked, Eye, EyeOff, Plus } from 'lucide-react-native'

import { PageHeader } from '@/components/page-header'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { LORE_CATEGORIES, useLorebook, type LoreCategory } from '@/hooks/useLorebook'
import { useT, type T } from '@/i18n/t'
import { cn } from '@/lib/utils'
import type { LorebookEntry } from '@/types'

/** 分类筛选值：'all' 之外直接用服务端类型 key，展示名经 t() 翻译 */
type CategoryFilter = 'all' | LoreCategory

/** 模块级常量只存 key，渲染时经 t() 取文案 */
const CATEGORY_LABEL_KEYS = {
  npc: 'dfLorebookCatNpc',
  location: 'dfLorebookCatLocation',
  item: 'dfLorebookCatItem',
  faction: 'dfLorebookCatFaction',
  event: 'dfLorebookCatEvent',
  other: 'dfLorebookCatOther',
} as const

function categoryLabel(category: string, t: T): string {
  return (LORE_CATEGORIES as readonly string[]).includes(category)
    ? t(CATEGORY_LABEL_KEYS[category as LoreCategory])
    : category
}

export default function LorebookScreen() {
  const t = useT()
  const { worlds, worldId, setWorldId, entries, loading, error, refresh, addWorld, addEntry, updateEntry, deleteEntry } = useLorebook()
  const [category, setCategory] = React.useState<CategoryFilter>('all')
  const [worldEditorOpen, setWorldEditorOpen] = React.useState(false)
  const [worldName, setWorldName] = React.useState('')
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LorebookEntry | null>(null)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [formCategory, setFormCategory] = React.useState<LoreCategory>('other')
  const [isPublic, setIsPublic] = React.useState(false)

  const filtered = category === 'all' ? entries : entries.filter((entry) => entry.category === category)

  function closeEditor() {
    setSheetOpen(false)
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory('other')
    setIsPublic(false)
  }

  function openCreate() {
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory(category === 'all' ? 'other' : category)
    setIsPublic(false)
    setSheetOpen(true)
  }

  function openEdit(entry: LorebookEntry) {
    setEditing(entry)
    setTitle(entry.title)
    setContent(entry.content)
    setFormCategory((LORE_CATEGORIES as readonly string[]).includes(entry.category) ? (entry.category as LoreCategory) : 'other')
    setIsPublic(entry.isPublic)
    setSheetOpen(true)
  }

  async function saveWorld() {
    if (!worldName.trim()) return
    await addWorld(worldName.trim())
    setWorldName('')
    setWorldEditorOpen(false)
  }

  async function save() {
    if (!title.trim() || !content.trim()) return
    const payload = {
      title: title.trim(),
      content: content.trim(),
      category: formCategory,
      isPublic,
    }
    if (editing) await updateEntry(editing.id, payload)
    else await addEntry(payload)
    closeEditor()
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={t('dfLorebookTitle')}
        subtitle={loading ? t('dfLorebookSyncing') : t('dfLorebookCountSubtitle', { count: entries.length })}
        className="px-0"
        right={
          <Button size="sm" onPress={openCreate}>
            <Icon as={Plus} size={16} />
            <Text>{t('dfLorebookNewEntry')}</Text>
          </Button>
        }
      />

      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Text>{t('dfCommonRetry')}</Text></Button></View> : null}
      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <SheetSelect
            options={worlds.map((world) => ({ label: String(world.name || world.world_name || world.id || world.world_id), value: String(world.id || world.world_id) }))}
            value={worldId}
            onValueChange={setWorldId}
            placeholder={t('dfLorebookSelectWorld')}
          />
        </View>
        <Button variant="outline" onPress={() => setWorldEditorOpen(true)}><Text>{t('dfLorebookNewWorld')}</Text></Button>
      </View>
      {/* 契约约束：横向 ScrollView 子元素默认被拉伸到容器满高（max-h-10），
          胶囊会变成鸡蛋形且文字顶置，contentContainer 必须带 items-center 保持自适应高度 */}
      <ScrollView horizontal className="mb-3 max-h-10" contentContainerClassName="items-center gap-2" showsHorizontalScrollIndicator={false}>
        {/* badge 风格轻量 pill：Button 按钮组在筛选位视觉过重 */}
        {(['all', ...LORE_CATEGORIES] as const).map((item) => {
          const active = category === item
          return (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              className={cn(
                'rounded-full border px-3 py-1.5 active:opacity-70',
                active ? 'border-primary bg-primary/15' : 'border-border bg-transparent',
              )}
              accessibilityState={{ selected: active }}
            >
              <Text variant="small" className={active ? 'font-semibold text-primary' : 'text-muted-foreground'}>
                {item === 'all' ? t('dfLorebookAll') : t(CATEGORY_LABEL_KEYS[item])}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable onPress={() => openEdit(item)}>
            <Card className="gap-3 py-4">
              <CardContent className="gap-3 px-4">
                <View className="flex-row items-start gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                    <Icon as={BookMarked} size={19} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 font-semibold" numberOfLines={1}>{item.title}</Text>
                      <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Icon as={item.isPublic ? Eye : EyeOff} size={12} />
                        <Text variant="small">{item.isPublic ? t('dfLorebookVisibilityPublic') : t('dfLorebookVisibilityGm')}</Text>
                      </View>
                    </View>
                    <Text variant="small">{categoryLabel(item.category, t)}</Text>
                  </View>
                </View>
                <Text className="leading-6 text-muted-foreground" numberOfLines={3}>{item.content}</Text>
                <View className="flex-row justify-end gap-2">
                  <Button size="sm" variant="ghost" onPress={() => openEdit(item)}><Text>{t('edit')}</Text></Button>
                  <Button size="sm" variant="ghost" onPress={() => void deleteEntry(item.id)}><Text className="text-destructive">{t('dfCommonDelete')}</Text></Button>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
        refreshing={loading}
        onRefresh={() => void refresh()}
        ListEmptyComponent={loading ? (
          <View className="gap-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </View>
        ) : (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={BookMarked} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{t('dfLorebookEmptyTitle')}</Text>
            <Text variant="small">{t('dfLorebookEmptyDesc')}</Text>
          </View>
        )}
      />

      <Sheet open={worldEditorOpen} onClose={() => setWorldEditorOpen(false)} className="h-auto">
        <View className="gap-4 pt-1"><View><Text variant="h3">{t('dfLorebookCreateWorldTitle')}</Text><Text variant="small">{t('dfLorebookCreateWorldDesc')}</Text></View><Input value={worldName} onChangeText={setWorldName} placeholder={t('customWorldName')} autoFocus /><View className="flex-row gap-2"><Button variant="outline" className="flex-1" onPress={() => setWorldEditorOpen(false)}><Text>{t('dfCommonCancel')}</Text></Button><Button className="flex-1" disabled={!worldName.trim()} onPress={() => void saveWorld()}><Text>{t('dfLorebookCreate')}</Text></Button></View></View>
      </Sheet>

      <Sheet open={sheetOpen} onClose={closeEditor} className="h-[82%]">
        <View className="gap-4 pt-1">
          <View>
            <Text variant="h3">{editing ? t('dfLorebookEditEntry') : t('dfLorebookAddEntry')}</Text>
            <Text variant="small">{t('dfLorebookEntryNameHint')}</Text>
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLorebookTitleLabel')}</Text>
            <Input value={title} onChangeText={setTitle} placeholder={t('dfLorebookTitlePlaceholder')} autoFocus />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLorebookCategoryLabel')}</Text>
            <SheetSelect
              options={LORE_CATEGORIES.map((item) => ({ label: t(CATEGORY_LABEL_KEYS[item]), value: item }))}
              value={formCategory}
              onValueChange={(value) => setFormCategory(value as LoreCategory)}
              placeholder={t('dfLorebookCategoryPlaceholder')}
            />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLorebookContentLabel')}</Text>
            <Textarea value={content} onChangeText={setContent} placeholder={t('dfLorebookContentPlaceholder')} className="min-h-36" />
          </View>
          <Pressable className="flex-row items-center gap-3 rounded-xl border border-border bg-muted p-3" onPress={() => setIsPublic((value) => !value)}>
            <View className={cn('h-9 w-9 items-center justify-center rounded-full', isPublic ? 'bg-primary/15' : 'bg-background')}>
              <Icon as={isPublic ? Eye : EyeOff} size={18} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold">{isPublic ? t('dfLorebookVisibilityPublic') : t('dfLorebookVisibilityGmLong')}</Text>
              <Text variant="small">{t('dfLorebookVisibilityHint')}</Text>
            </View>
          </Pressable>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={closeEditor}><Text>{t('dfCommonCancel')}</Text></Button>
            <Button className="flex-1" disabled={!title.trim() || !content.trim()} onPress={() => void save()}><Text>{t('dfCommonSave')}</Text></Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  )
}
