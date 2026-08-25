import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/patterns/sheet'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { createGame, fetchRules, fetchWorldTemplates } from '@/api/games'
import type { RuleSummary, WorldTemplateSummary } from '@/api/types'

/** 从模板摘要里取稳定 id */
function worldIdOf(w: WorldTemplateSummary): string {
  return String(w.id || w.world_id || '')
}

function OptionSelect({
  options,
  value,
  onValueChange,
  placeholder,
}: {
  options: Exclude<Option, undefined>[]
  value: string
  onValueChange: (value: string) => void
  placeholder: string
}) {
  const selected = options.find((option) => option.value === value)
  return (
    <Select
      value={selected}
      onValueChange={(option) => {
        if (option) onValueChange(option.value)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="w-full" inline>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} label={option.label} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** 创建对局底部抽屉（对齐 Web CreateView 的模板模式 v1 子集）。 */
export function CreateGameSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (gameKey: string) => void
}) {
  const [worlds, setWorlds] = React.useState<WorldTemplateSummary[]>([])
  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [worldId, setWorldId] = React.useState('')
  const [ruleId, setRuleId] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [solo, setSolo] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  // 加载模板 + 规则列表（仅一次）
  React.useEffect(() => {
    if (!open) return
    let active = true
    void (async () => {
      try {
        const [wt, rl] = await Promise.all([fetchWorldTemplates(), fetchRules()])
        if (!active) return
        setWorlds(wt.templates ?? [])
        setRules(rl.rules ?? [])
        // 默认选中第一个世界模板及其默认规则
        const firstWorld = wt.templates?.[0]
        if (firstWorld && !worldId) {
          setWorldId(worldIdOf(firstWorld))
          if (firstWorld.default_rule && !ruleId) setRuleId(firstWorld.default_rule)
        }
      } catch {
        // 列表拉不到时保持空列表，用户仍可手动填写
      }
    })()
    return () => {
      active = false
    }
  }, [open])

  // 切换世界模板时，若其默认规则存在则自动跟随（派生到渲染中完成，避免 effect 内 setState）
  const currentWorld = worlds.find((w) => worldIdOf(w) === worldId)
  const effectiveRuleId = React.useMemo(() => {
    if (ruleId) return ruleId
    if (currentWorld?.default_rule && rules.some((r) => r.rule_id === currentWorld.default_rule)) {
      return currentWorld.default_rule
    }
    return ruleId
  }, [ruleId, currentWorld, rules])

  const worldOptions = worlds.map((w) => ({ value: worldIdOf(w), label: w.name || w.world_name || w.id || '未命名' }))
  const ruleOptions = rules.map((r) => ({ value: r.rule_id, label: r.rule_name || r.rule_id }))

  async function submit() {
    setBusy(true)
    setError('')
    try {
      const result = await createGame({
        world_id: worldId || 'default_fantasy',
        game_name: name.trim() || currentWorld?.name || currentWorld?.world_name || '',
        rule_id: effectiveRuleId || ruleId,
        solo,
        description: description.trim(),
        difficulty: '标准',
        language: 'zh-CN',
      })
      if (!result.ok || !result.game_key) throw new Error('创建对局未返回 key')
      onCreated(result.game_key)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = !busy && (!!worldId || !!name.trim())

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="gap-4 pb-4">
        <Text variant="h3">创建对局</Text>

        {worldOptions.length > 0 && (
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold text-muted-foreground">
              世界模板
            </Text>
            <OptionSelect
              options={worldOptions}
              value={worldId}
              onValueChange={setWorldId}
              placeholder="选择世界"
            />
          </View>
        )}

        {ruleOptions.length > 0 && (
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold text-muted-foreground">
              规则
            </Text>
            <OptionSelect
              options={ruleOptions}
              value={effectiveRuleId}
              onValueChange={setRuleId}
              placeholder="选择规则"
            />
          </View>
        )}

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            对局名称（可选）
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder={currentWorld?.name || '例如：龙之远征'}
            autoCapitalize="none"
          />
        </View>

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            世界描述（可选）
          </Text>
          <Textarea
            value={description}
            onChangeText={setDescription}
            placeholder="一段简短的设定描述…"
            numberOfLines={3}
          />
        </View>

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            模式
          </Text>
          <Tabs value={solo ? 'solo' : 'multi'} onValueChange={(v) => setSolo(v === 'solo')}>
            <TabsList>
              <TabsTrigger value="solo">
                <Text variant="small">单人</Text>
              </TabsTrigger>
              <TabsTrigger value="multi">
                <Text variant="small">多人</Text>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </View>

        {error ? <Text className="text-destructive">{error}</Text> : null}

        <Button disabled={!canSubmit} onPress={() => void submit()}>
          <Text>{busy ? '创建中…' : '创建'}</Text>
        </Button>
      </View>
    </Sheet>
  )
}
