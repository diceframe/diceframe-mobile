import * as React from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { BookMarked, Plus } from 'lucide-react-native'

import { errorMessage } from '@/api/client'
import { PageHeader } from '@/components/page-header'
import { Sheet } from '@/components/patterns/sheet'
import { Screen } from '@/components/screen'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { LocalItemBadges } from '@/features/content-sync/LocalItemBadges'
import { PullSheet } from '@/features/content-sync/PullSheet'
import { serverItemSource } from '@/features/content-sync/pull-runner'
import { currentPushAccess } from '@/features/content-sync/push-runner'
import type { PushAccess } from '@/features/content-sync/sync-state'
import { useLocalLorebook, useLocalLorebooks, type LocalLorebookView } from '@/hooks/useLocalLorebooks'
import { useT } from '@/i18n/t'
import { confirmDestructive } from '@/lib/confirm'
import {
  INVALID_INTEGER,
  entryEditOf,
  entryFormOf,
  entryRows,
  hasEdits,
  newEntryEditOf,
  type EntryForm,
} from '@/lib/local-library/lorebook-edit'
import type { LorebookEntry } from '@/lib/portable/lorebook-v3'
import { useBackNavigation } from '@/hooks/use-back-navigation'

type BookSheet = { mode: 'create' } | { mode: 'rename'; book: LocalLorebookView }

/**
 * 本机 Lorebook：书列表（新建 / 重命名 / 复制 / 删除）与单本书的条目编辑。
 * 条目按稳定 id 定位，保存只写回改过的字段（见 lib/local-library/lorebook-edit）。
 */
export default function LocalLorebooksScreen() {
  const t = useT()
  const goBack = useBackNavigation('/lorebook')
  const { books, loading, error, refresh, createBook, renameBook, duplicateBook, deleteBook } = useLocalLorebooks()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [sheet, setSheet] = React.useState<BookSheet | null>(null)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [actionError, setActionError] = React.useState('')
  // 拉取只给房主（与推送同一判定）
  const [access, setAccess] = React.useState<PushAccess>('denied')
  const [pullOpen, setPullOpen] = React.useState(false)
  const localAvailable = books !== null

  React.useEffect(() => {
    if (!localAvailable) return
    let cancelled = false
    currentPushAccess()
      .then((value) => { if (!cancelled) setAccess(value) })
      .catch(() => { if (!cancelled) setAccess('denied') })
    return () => { cancelled = true }
  }, [localAvailable])

  const opened = openId ? books?.find((book) => book.localId === openId) ?? null : null

  function openSheet(next: BookSheet) {
    setName(next.mode === 'rename' ? next.book.name : '')
    setDescription(next.mode === 'rename' ? next.book.description : '')
    setSheet(next)
  }

  async function run(action: () => Promise<void>) {
    try {
      await action()
      setActionError('')
    } catch (cause) {
      setActionError(errorMessage(cause))
    }
  }

  async function saveBook() {
    if (!sheet || !name.trim()) return
    const current = sheet
    await run(async () => {
      if (current.mode === 'create') await createBook(name, description)
      else {
        const patch: { name?: string; description?: string } = {}
        if (name.trim() !== current.book.name) patch.name = name
        if (description !== current.book.description) patch.description = description
        if (Object.keys(patch).length) await renameBook(current.book.localId, patch)
      }
      setSheet(null)
    })
  }

  async function removeBook(book: LocalLorebookView) {
    const confirmed = await confirmDestructive({
      title: t('dfLocalLorebookDeleteTitle'),
      message: t('dfLocalLorebookDeleteMessage', { name: book.name || t('dfLocalLorebookUnnamed') }),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
    if (confirmed) await run(() => deleteBook(book.localId))
  }

  if (opened) {
    return <LocalLorebookEntries book={opened} onBack={() => { setOpenId(null); void refresh() }} />
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={t('dfLocalLorebooksTitle')}
        subtitle={t('dfLocalLorebooksSubtitle', { count: books?.length ?? 0 })}
        onBack={goBack}
        className="px-0"
        right={books ? (
          <Button size="sm" onPress={() => openSheet({ mode: 'create' })}>
            <Icon as={Plus} size={16} />
            <Text>{t('dfLocalLorebookNew')}</Text>
          </Button>
        ) : null}
      />
      {error || actionError ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="flex-1 text-destructive" numberOfLines={3}>{error || actionError}</Text>
          <Button size="sm" variant="outline" onPress={() => { setActionError(''); void refresh() }}><Text>{t('dfCommonRetry')}</Text></Button>
        </View>
      ) : null}
      {access !== 'denied' && localAvailable ? (
        <Button variant="outline" className="mb-3" onPress={() => setPullOpen(true)}><Text>{t('dfPullOpen')}</Text></Button>
      ) : null}
      <FlatList
        data={books ?? []}
        keyExtractor={(item) => item.localId}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void refresh()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable onPress={() => setOpenId(item.localId)}>
            <Card className="gap-3 py-4">
              <CardContent className="gap-2 px-4">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
                    <Icon as={BookMarked} size={19} />
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="flex-1 font-semibold" numberOfLines={1}>{item.name || t('dfLocalLorebookUnnamed')}</Text>
                      <LocalItemBadges readOnly={item.readOnly} badges={item.badges} />
                    </View>
                    <Text variant="small" numberOfLines={1}>{t('dfLocalLorebookEntryCount', { count: item.entryCount })}</Text>
                  </View>
                </View>
                {item.description ? <Text className="text-muted-foreground" numberOfLines={2}>{item.description}</Text> : null}
                <View className="flex-row justify-end gap-2">
                  {item.readOnly ? null : (
                    <Button size="sm" variant="ghost" onPress={() => openSheet({ mode: 'rename', book: item })}><Text>{t('dfLocalLorebookRename')}</Text></Button>
                  )}
                  <Button size="sm" variant="ghost" onPress={() => void run(() => duplicateBook(item.localId, t('dfLocalLorebookCopyName', { name: item.name || t('dfLocalLorebookUnnamed') })))}>
                    <Text>{t('dfLocalCardDuplicate')}</Text>
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => void removeBook(item)}><Text className="text-destructive">{t('dfCommonDelete')}</Text></Button>
                </View>
              </CardContent>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={loading ? (
          <View className="gap-2">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </View>
        ) : (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={BookMarked} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{t('dfLocalLorebookEmptyTitle')}</Text>
            <Text variant="small" className="text-center">{t('dfLocalLorebookEmptyDesc')}</Text>
          </View>
        )}
      />

      {pullOpen ? (
        <PullSheet open kind="lorebook" source={serverItemSource} onClose={() => { setPullOpen(false); void refresh() }} />
      ) : null}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} className="h-auto">
        <View className="gap-4 pt-1">
          <Text variant="h3">{sheet?.mode === 'rename' ? t('dfLocalLorebookRename') : t('dfLocalLorebookNew')}</Text>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookNameLabel')}</Text>
            <Input value={name} onChangeText={setName} autoFocus />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookDescriptionLabel')}</Text>
            <Textarea value={description} onChangeText={setDescription} className="min-h-20" />
          </View>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setSheet(null)}><Text>{t('dfCommonCancel')}</Text></Button>
            <Button className="flex-1" disabled={!name.trim()} onPress={() => void saveBook()}><Text>{t('dfCommonSave')}</Text></Button>
          </View>
        </View>
      </Sheet>
    </Screen>
  )
}

interface EntryEditor {
  /** 空串 = 新条目 */
  entryId: string
  /** 打开时的表单快照：保存时只写回相对它改过的字段 */
  snapshot: EntryForm
}

function LocalLorebookEntries({ book: summary, onBack }: { book: LocalLorebookView; onBack: () => void }) {
  const t = useT()
  const { book, readOnly, error, refresh, saveEntry, deleteEntry } = useLocalLorebook(summary.localId)
  const [editor, setEditor] = React.useState<EntryEditor | null>(null)
  const [form, setForm] = React.useState<EntryForm>(() => entryFormOf(null))
  const [formError, setFormError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const rows = book ? entryRows(book) : []

  function open(entryId: string, entry: LorebookEntry | null) {
    const snapshot = entryFormOf(entry)
    setForm(snapshot)
    setFormError('')
    setEditor({ entryId, snapshot })
  }

  function patch(next: Partial<EntryForm>) {
    setForm((current) => ({ ...current, ...next }))
  }

  async function save() {
    if (!editor || busy) return
    let edit
    try {
      edit = editor.entryId ? entryEditOf(editor.snapshot, form) : newEntryEditOf(form)
    } catch (cause) {
      setFormError((cause as { code?: string }).code === INVALID_INTEGER ? t('dfLocalLorebookInvalidInteger') : errorMessage(cause))
      return
    }
    setBusy(true)
    try {
      if (!editor.entryId || hasEdits(edit)) await saveEntry(editor.entryId, edit)
      setEditor(null)
    } catch (cause) {
      setFormError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(entryId: string, entry: LorebookEntry) {
    const confirmed = await confirmDestructive({
      title: t('dfLocalLorebookDeleteEntryTitle'),
      message: t('dfLocalLorebookDeleteEntryMessage', { name: String(entry.name || '') || t('dfLocalLorebookUntitledEntry') }),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
    if (!confirmed) return
    try {
      await deleteEntry(entryId)
    } catch (cause) {
      setFormError(errorMessage(cause))
    }
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader
        title={String(book?.name || summary.name) || t('dfLocalLorebookUnnamed')}
        subtitle={t('dfLocalLorebookEntryCount', { count: rows.length })}
        onBack={onBack}
        className="px-0"
        right={book && !readOnly ? (
          <Button size="sm" onPress={() => open('', null)}>
            <Icon as={Plus} size={16} />
            <Text>{t('dfLocalLorebookNewEntry')}</Text>
          </Button>
        ) : null}
      />
      {error || (!editor && formError) ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="flex-1 text-destructive" numberOfLines={3}>{error || formError}</Text>
          <Button size="sm" variant="outline" onPress={() => { setFormError(''); void refresh() }}><Text>{t('dfCommonRetry')}</Text></Button>
        </View>
      ) : null}
      {readOnly ? <Text variant="small" className="mb-2 text-muted-foreground">{t('dfLocalLorebookReadOnlyHint')}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        showsVerticalScrollIndicator={false}
        renderItem={({ item: row }) => (
          <Pressable disabled={readOnly || !row.entryId} onPress={() => open(row.entryId, row.entry)}>
            <Card className="gap-2 py-3">
              <CardContent className="gap-2 px-4">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 font-semibold" numberOfLines={1}>{String(row.entry.name || '') || t('dfLocalLorebookUntitledEntry')}</Text>
                  {row.entry.enabled === false ? <Badge variant="secondary" className="px-1.5 py-0"><Text className="text-[10px]">{t('dfLocalLorebookDisabled')}</Text></Badge> : null}
                </View>
                {Array.isArray(row.entry.keys) && row.entry.keys.length ? (
                  <Text variant="small" numberOfLines={1}>{row.entry.keys.join(', ')}</Text>
                ) : null}
                <Text className="text-muted-foreground" numberOfLines={3}>{String(row.entry.content ?? '')}</Text>
                {readOnly || !row.entryId ? null : (
                  <View className="flex-row justify-end gap-2">
                    <Button size="sm" variant="ghost" onPress={() => open(row.entryId, row.entry)}><Text>{t('edit')}</Text></Button>
                    <Button size="sm" variant="ghost" onPress={() => void remove(row.entryId, row.entry)}><Text className="text-destructive">{t('dfCommonDelete')}</Text></Button>
                  </View>
                )}
              </CardContent>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={book ? (
          <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12">
            <Icon as={BookMarked} size={28} className="text-muted-foreground" />
            <Text className="font-semibold">{t('dfLocalLorebookNoEntries')}</Text>
          </View>
        ) : <Skeleton className="h-24 w-full rounded-xl" />}
      />

      <Sheet open={!!editor} onClose={() => setEditor(null)} className="h-[85%]">
        <ScrollView contentContainerClassName="gap-4 pb-6 pt-1" keyboardShouldPersistTaps="handled">
          <Text variant="h3">{editor?.entryId ? t('dfLocalLorebookEditEntry') : t('dfLocalLorebookNewEntry')}</Text>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookEntryName')}</Text>
            <Input value={form.name} onChangeText={(value) => patch({ name: value })} />
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookKeys')}</Text>
            <Input value={form.keysText} onChangeText={(value) => patch({ keysText: value })} autoCapitalize="none" />
            <Text variant="small" className="text-muted-foreground">{t('dfLocalLorebookKeysHint')}</Text>
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookSecondaryKeys')}</Text>
            <Input value={form.secondaryKeysText} onChangeText={(value) => patch({ secondaryKeysText: value })} autoCapitalize="none" />
            <Text variant="small" className="text-muted-foreground">{t('dfLocalLorebookSecondaryKeysHint')}</Text>
          </View>
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold">{t('dfLocalLorebookContent')}</Text>
            <Textarea value={form.content} onChangeText={(value) => patch({ content: value })} className="min-h-36" />
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1">{t('dfLocalLorebookEnabled')}</Text>
            <Switch checked={form.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1">{t('dfLocalLorebookConstant')}</Text>
            <Switch checked={form.constant} onCheckedChange={(constant) => patch({ constant })} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Text variant="small" className="font-semibold">{t('dfLocalLorebookInsertionOrder')}</Text>
              <Input value={form.insertionOrder} onChangeText={(value) => patch({ insertionOrder: value })} keyboardType="numbers-and-punctuation" />
            </View>
            <View className="flex-1 gap-1.5">
              <Text variant="small" className="font-semibold">{t('dfLocalLorebookPriority')}</Text>
              <Input value={form.priority} onChangeText={(value) => patch({ priority: value })} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Text variant="small" className="text-muted-foreground">{t('dfLocalLorebookIntegerHint')}</Text>
          {formError ? <Text className="text-destructive">{formError}</Text> : null}
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setEditor(null)}><Text>{t('dfCommonCancel')}</Text></Button>
            <Button className="flex-1" disabled={busy} onPress={() => void save()}><Text>{t('dfCommonSave')}</Text></Button>
          </View>
        </ScrollView>
      </Sheet>
    </Screen>
  )
}
