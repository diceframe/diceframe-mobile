/**
 * 骰灵当前的反应（对齐上游 composables/useAssistantReactions.ts）：产生方只调 report，
 * 本 store 按设置过滤、按优先级取舍，到时自动清空。纯表现层，不进 Agent 对话。
 */
import { create } from 'zustand'

import {
  REACTIONS,
  shouldReplace,
  type ReactionCategory,
  type ReactionDetail,
  type ReactionKind,
} from '@/lib/assistant-reactions'
import { useSettingsStore } from '@/stores/settings'

export interface ActiveReaction {
  id: number
  kind: ReactionKind
  detail: ReactionDetail
  startedAt: number
}

interface ReactionState {
  current: ActiveReaction | null
  report: (kind: ReactionKind, detail?: ReactionDetail) => void
  clear: () => void
}

export interface ReactionPreferences {
  enabled: boolean
  disabledCategories: ReactionCategory[]
}

export function createReactionStore(preferences: () => ReactionPreferences, now: () => number = Date.now) {
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  return create<ReactionState>((set, get) => ({
    current: null,
    report(kind, detail = {}) {
      const spec = REACTIONS[kind]
      const prefs = preferences()
      if (!spec || !prefs.enabled || prefs.disabledCategories.includes(spec.category)) return
      const at = now()
      if (!shouldReplace(get().current, kind, at)) return
      sequence += 1
      const reaction: ActiveReaction = { id: sequence, kind, detail, startedAt: at }
      set({ current: reaction })
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (get().current?.id === reaction.id) set({ current: null })
      }, spec.durationMs)
    },
    clear() {
      if (timer) clearTimeout(timer)
      timer = null
      set({ current: null })
    },
  }))
}

export const useReactionStore = createReactionStore(() => {
  const settings = useSettingsStore.getState()
  return { enabled: settings.assistantReactions, disabledCategories: settings.disabledReactionCategories }
})
