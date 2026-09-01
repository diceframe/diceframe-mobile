import * as React from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { BookMarked, Eye, EyeOff, Plus, Users } from 'lucide-react-native'

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
import { useLorebook } from '@/hooks/useLorebook'
import { useT, type T } from '@/i18n/t'
import {
  LORE_TIERS,
  LORE_TYPE_ORDER,
  parseVisibilityTargets,
  type LoreType,
  type LoreTier,
  type LoreVisibilityMode,
  type LorebookEntryView,
} from '@/lib/lorebook'
import { cn } from '@/lib/utils'

/** 分类筛选值：'all' 之外直接用服务端类型 key，展示名经 t() 翻译 */
type CategoryFilter = 'all' | LoreType

/** 模块级常量只存 key，渲染时经 t() 取文案；9 类与上游 loreTypeOrder 一一同名 */
const CATEGORY_LABEL_KEYS = {
  npc: 'dfLorebookCatNpc',
  location: 'dfLorebookCatLocation',
  faction: 'dfLorebookCatFaction',
  item: 'dfLorebookCatItem',
  event: 'dfLorebookCatEvent',
  puzzle: 'dfLorebookCatPuzzle',
  spell: 'dfLorebookCatSpell',
  class: 'dfLorebookCatClass',
  other: 'dfLorebookCatOther',
} as const

/** tier 只表示条目重要度（与可见性无关），文案直接复用上游 key */
const TIER_LABEL_KEYS = { core: 'core', background: 'background', archived: 'archived' } as const

/** 编辑表单的可见性三档，与 Web 编辑弹窗同一组上游 key：仅 GM / 全队公开 / 指定成员 */
const VISIBILITY_LABEL_KEYS = {
  gm: 'loreAudienceGmSecret',
  public: 'loreVisibilityPublic',
  characters: 'loreVisibilityCharacters',
} as const

const VISIBILITY_MODES: readonly LoreVisibilityMode[] = ['gm', 'public', 'characters']

function categoryLabel(category: LoreType, t: T): string {
  return t(CATEGORY_LABEL_KEYS[category])
}

/** 列表徽章按 visible_to 派生的档位取文案，复用 Web 徽章的上游 key（三态与徽章派生同源） */
function visibilityBadgeLabel(mode: LoreVisibilityMode, t: T): string {
  if (mode === 'public') return t('loreAudiencePublic')
  if (mode === 'characters') return t('loreAudienceCharacterOnlyShort')
  return t('loreAudienceGmSecret')
}

/** 徽章图标随档位切换；characters 用「多人」图标与仅 GM/全队区分 */
function visibilityBadgeIcon(mode: LoreVisibilityMode) {
  if (mode === 'public') return Eye
  if (mode === 'characters') return Users
  return EyeOff
}

export default function LorebookScreen() {
  const t = useT()
  const { worlds, worldId, setWorldId, entries, loading, error, refresh, addWorld, addEntry, updateEntry, deleteEntry } = useLorebook()
  const [category, setCategory] = React.useState<CategoryFilter>('all')
  const [worldEditorOpen, setWorldEditorOpen] = React.useState(false)
  const [worldName, setWorldName] = React.useState('')
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LorebookEntryView | null>(null)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [formCategory, setFormCategory] = React.useState<LoreType>('other')
  const [formTier, setFormTier] = React.useState<LoreTier>('background')
  const [visibility, setVisibility] = React.useState<LoreVisibilityMode>('gm')
  const [visibleToText, setVisibleToText] = React.useState('')

  const filtered = category === 'all' ? entries : entries.filter((entry) => entry.type === category)

  function closeEditor() {
    setSheetOpen(false)
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory('other')
    setFormTier('background')
    setVisibility('gm')
    setVisibleToText('')
  }

  function openCreate() {
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory(category === 'all' ? 'other' : category)
    // 新条目默认值与 Web 一致：tier=background，仅 GM 可见
    setFormTier('background')
    setVisibility('gm')
    setVisibleToText('')
    setSheetOpen(true)
  }

  function openEdit(entry: LorebookEntryView) {
    setEditing(entry)
    setTitle(entry.title)
    setContent(entry.content)
    // 保留条目原始 type（9 类全集内），保存时原样写回，不再折叠成 other
    setFormCategory(entry.type)
    setFormTier(entry.tier)
    // 可见性从真实 visible_to 派生，tier 不参与可见性判定
    setVisibility(entry.visibility)
    setVisibleToText(entry.visibleTo.join(', '))
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
      type: formCategory,
      tier: formTier,
      visibility,
      // 指定成员档以手输名单为准，保存前统一过 sanitize（剥公开标记/去重）
      visibleTo: visibility === 'characters' ? parseVisibilityTargets(visibleToText) : [],
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
        {(['all', ...LORE_TYPE_ORDER] as const).map((item) => {
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
                {item === 'all' ? t('dfLorebookAll') : categoryLabel(item, t)}
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
                      {/* 可见性徽章由 visible_to 派生（gm/characters/public 三态），不再用 tier 冒充 */}
                      <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Icon as={visibilityBadgeIcon(item.visibility)} size={12} />
                        <Text variant="small" numberOfLines={1}>{visibilityBadgeLabel(item.visibility, t)}</Text>
                      </View>
                    </View>
                    <Text variant="small" numberOfLines={1}>
                      {categoryLabel(item.type, t)} · {t(TIER_LABEL_KEYS[item.tier])}
                    </Text>
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
              options={LORE_TYPE_ORDER.map((item) => ({ label: categoryLabel(item, t), value: item }))}
              value={formCategory}
              onValueChange={(value) => setFormCategory(value as LoreType)}
              placeholder={t('dfLorebookCategoryPlaceholder')}
            />
          </View>
          {/* tier 与可见性是独立维度：这里只选重要度，选「归档」不会把条目变成仅 GM */}
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('tier')}</Text>
            <SheetSelect
              options={LORE_TIERS.map((tier) => ({ label: t(TIER_LABEL_KEYS[tier]), value: tier }))}
              value={formTier}
              onValueChange={(value) => setFormTier(value as LoreTier)}
              placeholder={t('tier')}
            />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLorebookContentLabel')}</Text>
            <Textarea value={content} onChangeText={setContent} placeholder={t('dfLorebookContentPlaceholder')} className="min-h-36" />
          </View>
          {/* 可见性写入 visible_to：gm=[]、public=['*']；指定成员档目前提供与 Web
              文本框等价的手输路径，成员快捷点选（Web 的 player chips）待对局成员
              列表接入世界书场景后再补——不做点半套的错误语义 */}
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('loreVisibilityLabel')}</Text>
            <SheetSelect
              options={VISIBILITY_MODES.map((mode) => ({ label: t(VISIBILITY_LABEL_KEYS[mode]), value: mode }))}
              value={visibility}
              onValueChange={(value) => setVisibility(value as LoreVisibilityMode)}
              placeholder={t('loreVisibilityLabel')}
            />
          </View>
          {visibility === 'characters' ? (
            <View className="gap-1.5">
              <Text variant="small" className="font-semibold">{t('visibleCharacters')}</Text>
              <Input
                value={visibleToText}
                onChangeText={setVisibleToText}
                placeholder={t('visibleCharactersPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={closeEditor}><Text>{t('dfCommonCancel')}</Text></Button>
            <Button className="flex-1" disabled={!title.trim() || !content.trim()} onPress={() => void save()}><Text>{t('dfCommonSave')}</Text></Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  )
}
