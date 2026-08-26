import * as React from 'react'
import { FlatList, View } from 'react-native'
import { CopyPlus, Gavel, Plus, Star } from 'lucide-react-native'
import { useRouter } from 'expo-router'

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
import { useRules } from '@/hooks/useRules'

export default function RulesScreen() {
  const router = useRouter()
  const { rules, loading, error, refresh, addRule, deleteRule } = useRules()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [sourceId, setSourceId] = React.useState('')
  const [ruleId, setRuleId] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const effectiveSourceId = sourceId || rules[0]?.rule_id || ''

  function close() { setEditorOpen(false); setRuleId(''); setName(''); setDescription('') }
  async function save() {
    if (!effectiveSourceId || !ruleId.trim() || !name.trim()) return
    setBusy(true)
    try { await addRule({ source_rule_id: effectiveSourceId, rule_id: ruleId.trim(), rule_name: name.trim(), description: description.trim() }); close() }
    finally { setBusy(false) }
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 840, alignSelf: 'center' }}>
      <PageHeader title="规则库" subtitle={loading ? '正在同步规则' : `${rules.length} 套可用规则`} onBack={() => router.back()} className="px-0" right={<Button size="sm" onPress={() => setEditorOpen(true)}><Icon as={Plus} size={16} /><Text>复制规则</Text></Button>} />
      {error ? <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"><Text className="flex-1 text-destructive">{error}</Text><Button size="sm" variant="outline" onPress={() => void refresh()}><Text>重试</Text></Button></View> : null}
      <View className="mb-3 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"><View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15"><Icon as={CopyPlus} size={19} /></View><View className="flex-1"><Text className="font-semibold">从稳定规则复制</Text><Text variant="small">自定义规则由基础规则复制而来，避免从空白配置遗漏机制字段。</Text></View></View>
      <FlatList
        data={rules}
        keyExtractor={(item) => item.rule_id}
        className="flex-1"
        contentContainerClassName="gap-2 pb-8"
        refreshing={loading}
        onRefresh={() => void refresh()}
        renderItem={({ item }) => <Card className="gap-3 py-4"><CardContent className="gap-3 px-4"><View className="flex-row items-center gap-3"><View className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted"><Icon as={Gavel} size={18} /></View><View className="min-w-0 flex-1"><View className="flex-row items-center gap-2"><Text className="flex-1 font-semibold" numberOfLines={1}>{item.rule_name || item.rule_id}</Text>{item.custom ? <View className="flex-row items-center gap-1 rounded-full bg-primary/15 px-2 py-1"><Icon as={Star} size={12} /><Text variant="small">自定义</Text></View> : null}</View><Text variant="small">{item.rule_id} · {item.dice_system || '通用骰制'}</Text></View></View><Text className="leading-6 text-muted-foreground" numberOfLines={3}>{item.description || '没有提供规则说明'}</Text>{item.custom ? <View className="flex-row justify-end"><Button size="sm" variant="ghost" onPress={() => void deleteRule(item.rule_id)}><Text className="text-destructive">删除自定义规则</Text></Button></View> : null}</CardContent></Card>}
        ListEmptyComponent={!loading ? <View className="items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12"><Icon as={Gavel} size={28} className="text-muted-foreground" /><Text className="font-semibold">服务器没有返回规则</Text></View> : null}
      />
      <Sheet open={editorOpen} onClose={close} className="h-auto"><View className="gap-4 pt-1"><View><Text variant="h3">复制自定义规则</Text><Text variant="small">选择基础规则并指定稳定 ID；创建后可在新对局中选择。</Text></View><View className="gap-1.5"><Text variant="small" className="font-semibold">基础规则</Text><SheetSelect options={rules.map((rule) => ({ label: rule.rule_name || rule.rule_id, value: rule.rule_id }))} value={effectiveSourceId} onValueChange={setSourceId} placeholder="选择基础规则" /></View><View className="gap-1.5"><Text variant="small" className="font-semibold">规则 ID</Text><Input value={ruleId} onChangeText={setRuleId} placeholder="例如 my_campaign_rule" autoCapitalize="none" /></View><View className="gap-1.5"><Text variant="small" className="font-semibold">显示名称</Text><Input value={name} onChangeText={setName} placeholder="规则名称" /></View><Textarea value={description} onChangeText={setDescription} placeholder="规则说明（可选）" className="min-h-24" /><View className="flex-row gap-2"><Button variant="outline" className="flex-1" onPress={close}><Text>取消</Text></Button><Button className="flex-1" disabled={busy || !effectiveSourceId || !ruleId.trim() || !name.trim()} onPress={() => void save()}><Text>{busy ? '创建中' : '创建'}</Text></Button></View></View></Sheet>
    </Screen>
  )
}
