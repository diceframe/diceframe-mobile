import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/patterns/sheet'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { createGame, fetchRules, fetchWorldTemplates } from '@/api/games'
import type { RuleSummary, WorldTemplateSummary } from '@/api/types'
import { useT } from '@/i18n/t'

/** 从模板摘要里取稳定 id */
function worldIdOf(w: WorldTemplateSummary): string {
  return String(w.id || w.world_id || '')
}

/** 创建对局底部抽屉（对齐 Web CreateView 的模板模式 v1 子集）。 */
export function CreateGameSheet({
  open,
  onClose,
  onCreated,
  preselectedWorldId,
}: {
  open: boolean
  onClose: () => void
  onCreated: (gameKey: string) => void
  /** 世界图鉴「用它开团」带入选中的世界 id */
  preselectedWorldId?: string | null
}) {
  const t = useT()
  const [worlds, setWorlds] = React.useState<WorldTemplateSummary[]>([])
  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [worldId, setWorldId] = React.useState('')
  const [ruleId, setRuleId] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [solo, setSolo] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  // 加载模板 + 规则列表（组件由父级用 key 在每次打开时重挂载，表单状态天然全新）
  React.useEffect(() => {
    if (!open) return
    let active = true
    void (async () => {
      try {
        const [wt, rl] = await Promise.all([fetchWorldTemplates(), fetchRules()])
        if (!active) return
        setWorlds(wt.templates ?? [])
        setRules(rl.rules ?? [])
        // 世界图鉴「用它开团」的预选世界优先，否则默认选第一个模板及其默认规则
        const preferred =
          wt.templates?.find((w) => worldIdOf(w) === preselectedWorldId) ?? wt.templates?.[0]
        if (preferred) {
          setWorldId(worldIdOf(preferred))
          if (preferred.default_rule) setRuleId(preferred.default_rule)
        }
      } catch {
        // 列表拉不到时保持空列表，用户仍可手动填写
      }
    })()
    return () => {
      active = false
    }
  }, [open, preselectedWorldId])

  // 切换世界模板时，若其默认规则存在则自动跟随（派生到渲染中完成，避免 effect 内 setState）
  const currentWorld = worlds.find((w) => worldIdOf(w) === worldId)
  const effectiveRuleId =
    ruleId ||
    (currentWorld?.default_rule && rules.some((r) => r.rule_id === currentWorld.default_rule)
      ? currentWorld.default_rule
      : '')

  const worldOptions = worlds.map((w) => ({ value: worldIdOf(w), label: w.name || w.world_name || w.id || t('unnamed') }))
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
      if (!result.ok || !result.game_key) throw new Error(t('dfOverviewCreateNoKey'))
      onCreated(result.game_key)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dfOverviewCreateFailed'))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = !busy && (!!worldId || !!name.trim())

  return (
    <Sheet open={open} onClose={onClose}>
      <View className="gap-4 pb-4">
        <Text variant="h3">{t('dfOverviewCreate')}</Text>

        {worldOptions.length > 0 && (
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold text-muted-foreground">
              {t('worldTemplate')}
            </Text>
            <SheetSelect
              options={worldOptions}
              value={worldId}
              onValueChange={setWorldId}
              placeholder={t('dfOverviewPickWorld')}
            />
          </View>
        )}

        {ruleOptions.length > 0 && (
          <View className="gap-1.5">
            <Text variant="small" className="font-semibold text-muted-foreground">
              {t('rule')}
            </Text>
            <SheetSelect
              options={ruleOptions}
              value={effectiveRuleId}
              onValueChange={setRuleId}
              placeholder={t('dfOverviewPickRule')}
            />
          </View>
        )}

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {t('dfOverviewNameOptional')}
          </Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder={currentWorld?.name || t('dfOverviewNamePlaceholder')}
            autoCapitalize="none"
          />
        </View>

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {t('dfOverviewDescOptional')}
          </Text>
          <Textarea
            value={description}
            onChangeText={setDescription}
            placeholder={t('dfOverviewDescPlaceholder')}
            numberOfLines={3}
          />
        </View>

        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {t('mode')}
          </Text>
          <Tabs value={solo ? 'solo' : 'multi'} onValueChange={(v) => setSolo(v === 'solo')}>
            <TabsList>
              <TabsTrigger value="solo">
                <Text variant="small">{t('solo')}</Text>
              </TabsTrigger>
              <TabsTrigger value="multi">
                <Text variant="small">{t('multiplayer')}</Text>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </View>

        {error ? <Text className="text-destructive">{error}</Text> : null}

        <Button disabled={!canSubmit} onPress={() => void submit()}>
          <Text>{busy ? t('creating') : t('create')}</Text>
        </Button>
      </View>
    </Sheet>
  )
}
