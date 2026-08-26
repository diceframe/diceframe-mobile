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
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useLorebook } from '@/hooks/useLorebook'
import { cn } from '@/lib/utils'
import type { LorebookEntry } from '@/types'

const CATEGORIES = ['人物', '地点', '物品', '组织', '事件', '其他']

export default function LorebookScreen() {
  const { worlds, worldId, setWorldId, entries, loading, error, refresh, addWorld, addEntry, updateEntry, deleteEntry } = useLorebook()
  const [category, setCategory] = React.useState('全部')
  const [worldEditorOpen, setWorldEditorOpen] = React.useState(false)
  const [worldName, setWorldName] = React.useState('')
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<LorebookEntry | null>(null)
  const [title, setTitle] = React.useState('')
  const [content, setContent] = React.useState('')
  const [formCategory, setFormCategory] = React.useState('其他')
  const [isPublic, setIsPublic] = React.useState(false)

  const filtered = category === '全部' ? entries : entries.filter((entry) => entry.category === category)

  function closeEditor() {
    setSheetOpen(false)
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory('其他')
    setIsPublic(false)
  }

  function openCreate() {
    setEditing(null)
    setTitle('')
    setContent('')
    setFormCategory(category === '全部' ? '其他' : category)
    setIsPublic(false)
    setSheetOpen(true)
  }

  function openEdit(entry: LorebookEntry) {
    setEditing(entry)
    setTitle(entry.title)
    setContent(entry.content)
    setFormCategory(entry.category)
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
        title="世界设定"
        subtitle={loading ? '正在同步世界书' : `${entries.length} 条设定 · 对局中的世界知识`}
        className="px-0"
        right={
          <Button size="sm" onPress={openCreate}>
            <Icon as={Plus} size={16} />
            <Text>新设定</Text>
          </Button>
        }
      />

      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Text>重试</Text></Button></View> : null}
      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <SheetSelect
            options={worlds.map((world) => ({ label: String(world.name || world.world_name || world.id || world.world_id), value: String(world.id || world.world_id) }))}
            value={worldId}
            onValueChange={setWorldId}
            placeholder="选择世界书"
          />
        </View>
        <Button variant="outline" onPress={() => setWorldEditorOpen(true)}><Text>新世界</Text></Button>
      </View>
      <ScrollView horizontal className="mb-3 max-h-10" contentContainerClassName="gap-2" showsHorizontalScrollIndicator={false}>
        {['全部', ...CATEGORIES].map((item) => (
          <Button key={item} size="sm" variant={category === item ? 'default' : 'outline'} onPress={() => setCategory(item)}>
            <Text>{item}</Text>
          </Button>
        ))}
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
                  <View className="h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                    <Icon as={BookMarked} size={19} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 font-semibold" numberOfLines={1}>{item.title}</Text>
                      <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Icon as={item.isPublic ? Eye : EyeOff} size={12} />
                        <Text variant="small">{item.isPublic ? '玩家可见' : '仅 GM'}</Text>
                      </View>
                    </View>
                    <Text variant="small">{item.category}</Text>
                  </View>
                </View>
                <Text className="leading-6 text-muted-foreground" numberOfLines={3}>{item.content}</Text>
                <View className="flex-row justify-end gap-2">
                  <Button size="sm" variant="ghost" onPress={() => openEdit(item)}><Text>编辑</Text></Button>
                  <Button size="sm" variant="ghost" onPress={() => void deleteEntry(item.id)}><Text className="text-destructive">删除</Text></Button>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
        refreshing={loading}
        onRefresh={() => void refresh()}
        ListEmptyComponent={!loading ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={BookMarked} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">这个分类还没有设定</Text>
            <Text variant="small">记录地点、组织和关键物品，供后续对局使用。</Text>
          </View>
        ) : null}
      />

      <Sheet open={worldEditorOpen} onClose={() => setWorldEditorOpen(false)} className="h-auto">
        <View className="gap-4 pt-1"><View><Text variant="h3">创建世界书</Text><Text variant="small">世界书用于归档一组属于同一世界的设定条目。</Text></View><Input value={worldName} onChangeText={setWorldName} placeholder="世界名称" autoFocus /><View className="flex-row gap-2"><Button variant="outline" className="flex-1" onPress={() => setWorldEditorOpen(false)}><Text>取消</Text></Button><Button className="flex-1" disabled={!worldName.trim()} onPress={() => void saveWorld()}><Text>创建</Text></Button></View></View>
      </Sheet>

      <Sheet open={sheetOpen} onClose={closeEditor} className="h-[82%]">
        <View className="gap-4 pt-1">
          <View>
            <Text variant="h3">{editing ? '编辑设定' : '添加设定'}</Text>
            <Text variant="small">设定名称是显示文本，不会改变内容的稳定标识。</Text>
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">标题</Text>
            <Input value={title} onChangeText={setTitle} placeholder="设定标题" autoFocus />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">分类</Text>
            <SheetSelect
              options={CATEGORIES.map((item) => ({ label: item, value: item }))}
              value={formCategory}
              onValueChange={setFormCategory}
              placeholder="选择分类"
            />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">内容</Text>
            <Textarea value={content} onChangeText={setContent} placeholder="描述这条设定，以及它在故事中的作用" className="min-h-36" />
          </View>
          <Pressable className="flex-row items-center gap-3 rounded-xl border border-border bg-muted p-3" onPress={() => setIsPublic((value) => !value)}>
            <View className={cn('h-9 w-9 items-center justify-center rounded-full', isPublic ? 'bg-primary/15' : 'bg-background')}>
              <Icon as={isPublic ? Eye : EyeOff} size={18} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold">{isPublic ? '玩家可见' : '仅 GM 可见'}</Text>
              <Text variant="small">点击切换这条设定在对局中的可见范围</Text>
            </View>
          </Pressable>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={closeEditor}><Text>取消</Text></Button>
            <Button className="flex-1" disabled={!title.trim() || !content.trim()} onPress={() => void save()}><Text>保存</Text></Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  )
}
