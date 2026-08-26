import * as React from 'react'
import { FlatList, View } from 'react-native'
import { Plus, RefreshCw, Swords, UserRound } from 'lucide-react-native'

import { libraryAvatarSource } from '@/api/assets'
import { PageHeader } from '@/components/page-header'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Sheet } from '@/components/patterns/sheet'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { useCharacters } from '@/hooks/useCharacters'
import type { Character } from '@/types'

export default function CharactersScreen() {
  const { characters, loading, error, refresh, addCharacter, updateCharacter, deleteCharacter } = useCharacters()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Character | null>(null)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  function closeEditor() {
    setSheetOpen(false)
    setEditing(null)
    setName('')
    setDescription('')
  }

  function openEditor(character?: Character) {
    setEditing(character ?? null)
    setName(character?.name ?? '')
    setDescription(character?.description ?? '')
    setSheetOpen(true)
  }

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const payload = { name: name.trim(), description: description.trim() }
      if (editing) await updateCharacter(editing.id, payload)
      else await addCharacter(payload)
      closeEditor()
    } finally { setBusy(false) }
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title="角色名册"
        subtitle={loading ? '正在同步角色卡库' : `${characters.length} 张共享角色卡`}
        className="px-0"
        right={<Button size="sm" onPress={() => openEditor()}><Icon as={Plus} size={16} /><Text>新角色</Text></Button>}
      />
      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive" numberOfLines={2}>{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Icon as={RefreshCw} size={15} /><Text>重试</Text></Button></View> : null}
      <View className="mb-3 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={Swords} size={19} /></View>
        <View className="flex-1"><Text className="font-semibold">跨对局角色卡</Text><Text variant="small">这里的角色来自服务器角色卡库，可在加入或替换角色时直接使用。</Text></View>
      </View>
      <FlatList
        data={characters}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void refresh()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Card className="gap-3 py-4"><CardContent className="flex-row items-center gap-3 px-4"><RemoteAvatar source={libraryAvatarSource(item.portrait)} name={item.name} className="h-11 w-11 rounded-full border border-border bg-muted" /><View className="min-w-0 flex-1"><Text className="font-semibold" numberOfLines={1}>{item.name}</Text><Text variant="small" numberOfLines={2}>{item.description || '还没有补充角色背景'}</Text></View><View className="gap-1"><Button size="sm" variant="ghost" onPress={() => openEditor(item)}><Text>编辑</Text></Button><Button size="sm" variant="ghost" onPress={() => void deleteCharacter(item.id)}><Text className="text-destructive">删除</Text></Button></View></CardContent></Card>
        )}
        ListEmptyComponent={!loading ? <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12"><Icon as={UserRound} size={28} className="text-muted-foreground" /><Text className="font-semibold">角色卡库还是空的</Text><Text variant="small">创建第一张角色卡，之后可以在不同对局复用。</Text></View> : null}
      />
      <Sheet open={sheetOpen} onClose={closeEditor} className="h-auto"><View className="gap-4 pt-1"><View><Text variant="h3">{editing ? '编辑角色卡' : '创建角色卡'}</Text><Text variant="small">先记录名称和背景；规则属性会在具体对局中生成。</Text></View><View className="gap-1.5"><Text variant="small" className="font-semibold">角色名称</Text><Input value={name} onChangeText={setName} placeholder="角色名称" autoFocus /></View><View className="gap-1.5"><Text variant="small" className="font-semibold">角色背景</Text><Textarea value={description} onChangeText={setDescription} placeholder="身份、经历、性格或目标" className="min-h-28" /></View><View className="flex-row gap-2"><Button variant="outline" className="flex-1" onPress={closeEditor}><Text>取消</Text></Button><Button className="flex-1" disabled={busy || !name.trim()} onPress={() => void save()}><Text>{busy ? '保存中' : '保存'}</Text></Button></View></View></Sheet>
    </Screen>
  )
}
