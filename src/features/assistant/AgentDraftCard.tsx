import * as React from 'react'
import { Pressable, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import {
  DRAFT_TARGETS,
  draftBlockers,
  draftItemsComplete,
  draftItemsOf,
  editedDraftOf,
  type AssistantDraft,
  type DraftItem,
} from '@/lib/assistant-agent'
import { cn } from '@/lib/utils'

import { agentKindLabel } from './agentLabels'

const TARGET_LABEL: Record<(typeof DRAFT_TARGETS)[number], TKey> = {
  world: 'dfAgentTargetWorld',
  lorebook: 'dfAgentTargetLorebook',
  character_template: 'dfAgentTargetCharacter',
  adventure: 'dfAgentTargetAdventure',
}

/**
 * 内容草稿卡（对齐上游 AgentTaskCard）：逐条改名称 / 正文 / 写入目标；改过之后旧的待批准
 * 立即作废，须「重新审查」拿到新方案，审查通过且未再改动才能「保存草稿」。
 * 宿主以 draft_id + 审查结果作 key 挂载，服务端给了新审查结果时表单整体重建。
 */
export function AgentDraftCard({
  draft,
  disabled,
  onEdit,
  onReview,
  onSave,
}: {
  draft: AssistantDraft
  disabled: boolean
  onEdit: (draftId: string) => void
  onReview: (draftId: string, draft: Record<string, unknown>) => void
  onSave: (draftId: string) => void
}) {
  const t = useT()
  const [items, setItems] = React.useState<DraftItem[]>(() => draftItemsOf(draft.review))
  const [edited, setEdited] = React.useState(false)
  const [openReferences, setOpenReferences] = React.useState<number | null>(null)
  const blockers = draftBlockers(draft.review)
  const reviewed = draft.review.ok === true && blockers.length === 0

  function patch(index: number, change: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...change } : item)))
    if (!edited) {
      setEdited(true)
      onEdit(draft.draft_id)
    }
  }

  return (
    <View className="gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-semibold">{agentKindLabel(t, draft.review.kind)}</Text>
        {edited ? <Text variant="small" className="text-primary">{t('dfAgentEdited')}</Text> : null}
      </View>

      {items.map((item, index) => (
        <View key={String(item.id ?? index)} className="gap-2 rounded-md border border-border bg-card p-2.5">
          <View className="gap-1">
            <Text variant="small" className="text-muted-foreground">{t('dfAgentName')}</Text>
            <Input
              value={String(item.name ?? '')}
              onChangeText={(name) => patch(index, { name })}
              editable={!disabled}
              accessibilityLabel={t('dfAgentName')}
            />
          </View>
          <View className="gap-1">
            <Text variant="small" className="text-muted-foreground">{t('dfAgentText')}</Text>
            <Textarea
              value={String(item.text ?? '')}
              onChangeText={(text) => patch(index, { text })}
              editable={!disabled}
              numberOfLines={6}
              className="min-h-24"
              accessibilityLabel={t('dfAgentText')}
            />
          </View>
          <View className="gap-1">
            <Text variant="small" className="text-muted-foreground">{t('dfAgentTarget')}</Text>
            <View className="flex-row flex-wrap gap-1.5" accessibilityRole="radiogroup">
              {DRAFT_TARGETS.map((target) => {
                const selected = item.target === target
                return (
                  <Pressable
                    key={target}
                    disabled={disabled}
                    onPress={() => {
                      if (!selected) patch(index, { target })
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 active:bg-accent',
                      selected ? 'border-primary bg-primary/10' : 'border-border',
                      disabled && 'opacity-50',
                    )}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled }}
                  >
                    <Text variant="small" className={selected ? 'text-primary' : 'text-muted-foreground'}>
                      {t(TARGET_LABEL[target])}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          {item.references?.length ? (
            <View className="gap-1">
              <Pressable onPress={() => setOpenReferences(openReferences === index ? null : index)} className="self-start active:opacity-70">
                <Text variant="small" className="text-muted-foreground">
                  {openReferences === index ? t('dfAgentHideDetails') : t('dfAgentDetails')}
                </Text>
              </Pressable>
              {openReferences === index ? (
                <Text selectable className="font-mono text-xs text-muted-foreground">
                  {JSON.stringify(item.references, null, 2)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      {blockers.length ? (
        <View className="gap-1">
          {blockers.map((blocker) => (
            <Text key={blocker} variant="small" className="text-destructive">• {blocker}</Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={disabled || !draftItemsComplete(items)}
          onPress={() => onReview(draft.draft_id, editedDraftOf(draft.review, items))}
        >
          <Text>{t('dfAgentReview')}</Text>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={disabled || edited || !reviewed}
          onPress={() => onSave(draft.draft_id)}
        >
          <Text>{t('dfAgentSave')}</Text>
        </Button>
      </View>
    </View>
  )
}
