import * as React from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Sheet } from '@/components/patterns/sheet'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { Text } from '@/components/ui/text'
import {
  createGame,
  createGameFromSeed,
  fetchAdventures,
  fetchRules,
  fetchWorldTemplates,
  generateRule,
  generateWorld,
} from '@/api/games'
import { fetchCharacterCards, fetchWorlds } from '@/api/library'
import type { AdventureSummary, CharacterCard, JsonObject, RuleSummary, WorldSummary, WorldTemplateSummary } from '@/api/types'
import { StepCharacters } from '@/features/create/StepCharacters'
import { StepConfirm } from '@/features/create/StepConfirm'
import { StepSettings } from '@/features/create/StepSettings'
import { StepWorld } from '@/features/create/StepWorld'
import {
  activeRuleIdOf,
  blankAdventurer,
  buildCreateRequest,
  sanitizeLoreChoice,
  type CreateCharacter,
  type CreateFormState,
  type NarrativePerspective,
} from '@/features/create/payload'
import { contentLanguage, useT } from '@/i18n/t'
import { cn } from '@/lib/utils'

const STEP_KEYS = ['stepWorld', 'stepGameSettings', 'stepCharacters', 'stepConfirm'] as const

/** 用户未操作过的空白占位卡（切换到专业规则时清除，对齐 Web） */
function isBlankCharacter(character: CreateCharacter): boolean {
  return !character.background
    && Object.keys(character.attributes ?? {}).length === 0
    && (character.skills ?? []).length === 0
}

function professionalOf(state: CreateFormState, rules: RuleSummary[]): boolean {
  const ruleId = activeRuleIdOf(state)
  return rules.find((r) => r.rule_id === ruleId)?.ruleset_runtime?.capabilities.character_builder === 'professional'
}

/**
 * 专业规则形态「翻转」时调整默认占位卡（对齐 Web watch(usesProfessionalBuilder)）：
 * 进专业规则清掉唯一空白卡；退回通用规则且无角色时补默认冒险者。
 * 仅在事件回调与目录加载完成的 setState 更新器里调用，避免 effect 内同步 setState。
 */
function applyCharacterAdjustments(
  prev: CreateFormState,
  next: CreateFormState,
  rules: RuleSummary[],
): CreateFormState {
  const wasProfessional = professionalOf(prev, rules)
  const isProfessional = professionalOf(next, rules)
  if (wasProfessional === isProfessional) return next
  if (isProfessional) {
    return next.players.length === 1 && isBlankCharacter(next.players[0]) ? { ...next, players: [] } : next
  }
  return next.players.length === 0 ? { ...next, players: [blankAdventurer(next.gameLanguage)] } : next
}

function initialState(): CreateFormState {
  const locale = contentLanguage()
  return {
    seed: '',
    gameLanguage: locale.startsWith('zh') ? 'zh-CN' : 'en',
    mode: 'template',
    worldId: '',
    worldName: '',
    ruleId: '',
    name: '',
    customName: '',
    customDesc: '',
    aiPrompt: '',
    aiRuleId: '',
    aiAutoRule: false,
    aiGeneratedRuleId: '',
    aiWorldId: '',
    aiWorldName: '',
    description: '',
    loreChoice: '__builtin__',
    adventureId: '',
    showAdventurePackages: false,
    solo: true,
    difficulty: '标准',
    narrativePerspective: 'immersive',
    supportsAdvancementPolicy: false,
    advancementMode: 'milestone',
    advancementAuthority: 'ai_gm',
    roomPassword: '',
    openRoom: false,
    players: [],
  }
}

/** 目录加载后重定选中项：世界保留/预选/首个，规则跟随默认规则（对齐 Web watch 链） */
function applyCatalog(
  state: CreateFormState,
  templates: WorldTemplateSummary[],
  rules: RuleSummary[],
  preselectWorldId: string | null,
  firstApply: boolean,
): CreateFormState {
  const worldIdOf = (w: WorldTemplateSummary) => String(w.world_id || w.id || '')
  let worldId = state.worldId
  const worldExists = templates.some((w) => worldIdOf(w) === worldId)
  if (!worldExists) {
    const preselected = firstApply && preselectWorldId
      ? templates.find((w) => worldIdOf(w) === preselectWorldId)
      : undefined
    worldId = preselected ? worldIdOf(preselected) : worldIdOf(templates[0] ?? { id: '' })
  }
  const currentWorld = templates.find((w) => worldIdOf(w) === worldId)
  const ruleIds = new Set(rules.map((r) => r.rule_id))
  let ruleId = state.ruleId
  if (!ruleIds.has(ruleId)) {
    const defaultRule = String(currentWorld?.default_rule || '')
    ruleId = ruleIds.has(defaultRule) ? defaultRule : (rules[0]?.rule_id ?? '')
  }
  return {
    ...state,
    worldId,
    worldName: String(currentWorld?.world_name || currentWorld?.name || ''),
    ruleId,
    // AI 模式的母版规则为空时跟随所选规则（对齐 Web aiRule 初值）
    aiRuleId: state.aiRuleId || ruleId,
  }
}

export function CreateWizard({ preselectedWorldId }: { preselectedWorldId?: string | null }) {
  const router = useRouter()
  const t = useT()
  const insets = useSafeAreaInsets()

  const [state, setState] = React.useState<CreateFormState>(initialState)
  // patch 内联专业规则翻转处理：规则切换是事件回调，不进 effect
  function patch(partial: Partial<CreateFormState>) {
    setState((prev) => applyCharacterAdjustments(prev, { ...prev, ...partial }, rules))
  }

  const [step, setStep] = React.useState(1)
  const [busy, setBusy] = React.useState(false)
  const [busyHint, setBusyHint] = React.useState<'rule' | 'world' | null>(null)
  const [error, setError] = React.useState('')
  const [catalogLoading, setCatalogLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)

  const [worlds, setWorlds] = React.useState<WorldTemplateSummary[]>([])
  const [rules, setRules] = React.useState<RuleSummary[]>([])
  const [loreWorlds, setLoreWorlds] = React.useState<WorldSummary[]>([])
  const [cards, setCards] = React.useState<CharacterCard[]>([])
  const [adventures, setAdventures] = React.useState<AdventureSummary[]>([])

  const [perspectiveTouched, setPerspectiveTouched] = React.useState(false)
  const [generatedPassword, setGeneratedPassword] = React.useState('')
  const [pendingKey, setPendingKey] = React.useState('')

  // 预选世界只在首次目录加载时生效（世界图鉴「用它开团」深链）
  const catalogApplied = React.useRef(false)

  // 目录加载：模板/规则随游戏语言变化重拉，世界/卡库一并刷新
  React.useEffect(() => {
    let active = true
    void (async () => {
      setCatalogLoading(true)
      try {
        const [wt, rl, lw, cs] = await Promise.all([
          fetchWorldTemplates(state.gameLanguage),
          fetchRules(state.gameLanguage),
          fetchWorlds(),
          fetchCharacterCards(),
        ])
        if (!active) return
        const templates = wt.templates ?? []
        const ruleList = rl.rules ?? []
        setWorlds(templates)
        setRules(ruleList)
        setLoreWorlds(lw.worlds ?? [])
        setCards(cs.cards ?? [])
        setLoadError(false)
        // firstApply 必须在更新器外求值：更新器惰性执行，而 ref 在 setState 返回后
        // 同步置位，更新器内再读 ref 会恒为 false，导致默认冒险者从未加入
        const firstApply = !catalogApplied.current
        catalogApplied.current = true
        setState((prev) => {
          const next = applyCatalog(prev, templates, ruleList, preselectedWorldId ?? null, firstApply)
          // 首次加载：非专业规则下补默认冒险者，保证极速创建路径可用
          const withDefault = firstApply
            && !professionalOf(next, ruleList)
            && next.players.length === 0
            ? { ...next, players: [blankAdventurer(next.gameLanguage)] }
            : next
          return applyCharacterAdjustments(prev, withDefault, ruleList)
        })
      } catch {
        if (active) setLoadError(true)
      } finally {
        if (active) setCatalogLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [state.gameLanguage, reloadToken, preselectedWorldId])

  const activeRuleSummary = rules.find((r) => r.rule_id === activeRuleIdOf(state))
  const usesProfessionalBuilder =
    activeRuleSummary?.ruleset_runtime?.capabilities.character_builder === 'professional'
  const ruleSupportsAdvancement = Boolean(
    activeRuleSummary
      && (activeRuleSummary.rule_id === 'dnd2024_srd' || activeRuleSummary.ruleset_runtime?.id === 'core:dnd2024'),
  )
  const ruleSupportsAdventurePackages = Boolean(
    activeRuleSummary?.ruleset_runtime?.capabilities.adventure_formats?.length,
  )
  const seedActive = !!state.seed.trim()
  const showAdventurePackages = state.mode === 'template' && ruleSupportsAdventurePackages && !seedActive
  // 默认场景图：模板世界自带 → 所选规则兜底（对齐 Web defaultSceneImageRef）
  const defaultSceneImage = (state.mode === 'template'
    ? worlds.find((w) => String(w.world_id || w.id || '') === state.worldId)?.scene_image
    : undefined) ?? activeRuleSummary?.scene_image ?? null

  // 冒险包目录：模板模式 + 规则支持时按 规则+世界 拉取。
  // 隐藏时不做同步清理：列表由派生变量过滤，adventure_id 在提交 payload 时按开关忽略
  React.useEffect(() => {
    if (!showAdventurePackages || !state.ruleId || !state.worldId) return
    let active = true
    void (async () => {
      try {
        const result = await fetchAdventures(state.gameLanguage, { ruleId: state.ruleId, worldId: state.worldId })
        if (!active) return
        const list = result.adventures ?? []
        setAdventures(list)
        setState((prev) =>
          list.some((a) => a.adventure_id === prev.adventureId && a.compatibility === 'compatible')
            ? prev
            : { ...prev, adventureId: '' },
        )
      } catch {
        if (active) setAdventures([])
      }
    })()
    return () => {
      active = false
    }
  }, [showAdventurePackages, state.ruleId, state.worldId, state.gameLanguage])

  // 世界书复制源失效的处理放在提交时清洗（sanitizeLoreChoice），这里不做同步 setState
  function handleSoloChange(solo: boolean) {
    patch({ solo, ...(perspectiveTouched ? {} : { narrativePerspective: solo ? 'immersive' : 'third_person' }) })
  }

  function handlePerspectiveChange(perspective: NarrativePerspective) {
    setPerspectiveTouched(true)
    patch({ narrativePerspective: perspective })
  }

  function canNext(): boolean {
    if (step === 1) {
      if (seedActive) return true
      if (!activeRuleIdOf(state)) return false
      if (state.mode === 'ai' && !state.aiPrompt.trim()) return false
      if (state.mode === 'custom' && !state.customName.trim()) return false
      return true
    }
    if (step === 3) {
      return state.players.length >= 1 && state.players.every((c) => !!c.character_name?.trim())
    }
    return true
  }

  const step3Invalid = step === 3
    && (state.players.length === 0
      || !state.players.every((c) => !!c.character_name?.trim()))

  async function goNext() {
    if (!canNext() || step >= 4) return
    setBusy(true)
    setError('')
    try {
      // 「按母版生成本局专属规则」在离开第 1 步时生成（对齐 Web prepareAiRule）
      if (step === 1 && state.mode === 'ai' && state.aiAutoRule && !state.aiGeneratedRuleId) {
        if (!state.aiPrompt.trim()) throw new Error(t('enterWorldPrompt'))
        setBusyHint('rule')
        const generated = await generateRule(state.aiPrompt.trim(), state.aiRuleId, state.gameLanguage)
        const ruleId = generated.rule_id ?? ''
        setRules((prev) => prev.some((r) => r.rule_id === ruleId) ? prev : [
          { rule_id: ruleId, rule_name: generated.rule_name, description: generated.description },
          ...prev,
        ])
        patch({ aiGeneratedRuleId: ruleId })
      }
      setStep((s) => s + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyHint(null)
      setBusy(false)
    }
  }

  function enterGame(gameKey: string) {
    // replace：从对局页返回不应回到向导
    router.replace({ pathname: '/play/[gameKey]', params: { gameKey } })
  }

  async function create() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      let working = state
      if (!seedActive && state.mode === 'ai') {
        if (!state.aiPrompt.trim()) throw new Error(t('enterWorldPrompt'))
        setBusyHint('world')
        const world = await generateWorld(state.aiPrompt.trim(), activeRuleIdOf(state), state.gameLanguage)
        working = { ...state, aiWorldId: world.world_id, aiWorldName: world.world_name || '' }
      }
      const request = buildCreateRequest({
        ...working,
        showAdventurePackages,
        supportsAdvancementPolicy: ruleSupportsAdvancement,
        // 复制源在语言切换后可能已失效：提交前清洗回模板自带
        loreChoice: sanitizeLoreChoice(
          working.loreChoice,
          loreWorlds.map((w) => ({
            worldId: String(w.world_id || w.id || ''),
            language: String(w.active_locale || w.language || ''),
          })),
          working.gameLanguage,
        ),
      })
      const result = request.endpoint === 'create-from-seed'
        ? await createGameFromSeed(request.body as JsonObject)
        : await createGame(request.body as JsonObject)
      if (!result.game_key) throw new Error(t('dfCreateFailed'))
      if (result.generated_password) {
        // 多人自动生成密码：先展示再进入（对齐 Web 的 alert）
        setPendingKey(result.game_key)
        setGeneratedPassword(result.generated_password)
        return
      }
      enterGame(result.game_key)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyHint(null)
      setBusy(false)
    }
  }

  function dismissPassword() {
    const gameKey = pendingKey
    setGeneratedPassword('')
    setPendingKey('')
    if (gameKey) enterGame(gameKey)
  }

  return (
    <Screen className="px-4">
      {/* 页头 */}
      <View className="mb-2 flex-row items-center gap-2">
        <Pressable
          onPress={() => router.back()}
          className="rounded-md p-1.5 active:bg-accent"
          accessibilityRole="button"
          accessibilityLabel={t('dfCommonCancel')}
        >
          <Icon as={ChevronLeft} size={22} />
        </Pressable>
        <View className="flex-1">
          <Text variant="h3">{t('createTitle')}</Text>
        </View>
        <Text variant="small" className="text-muted-foreground">
          {t('dfCreateStepProgress', { current: step, total: STEP_KEYS.length })}
        </Text>
      </View>

      {/* 步骤条 */}
      <View className="mb-4 flex-row gap-1.5">
        {STEP_KEYS.map((key, index) => {
          const n = index + 1
          const active = step === n
          const done = step > n
          return (
            <View
              key={key}
              className={cn(
                'flex-1 items-center rounded-full border py-1.5',
                active ? 'border-primary bg-primary/10' : done ? 'border-primary/40' : 'border-border',
              )}
            >
              <Text variant="small" className={cn(active ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                {done ? '✓ ' : ''}{t(key)}
              </Text>
            </View>
          )
        })}
      </View>

      {loadError ? (
        <View className="gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <Text className="text-destructive">{t('dfCreateLoadFailed')}</Text>
          <Button variant="outline" size="sm" className="self-start" onPress={() => setReloadToken((n) => n + 1)}>
            <Text>{t('dfCommonRetry')}</Text>
          </Button>
        </View>
      ) : catalogLoading ? (
        <View className="gap-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </View>
      ) : (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 1 && (
            <StepWorld
              state={state}
              patch={patch}
              worlds={worlds}
              rules={rules}
              loreWorlds={loreWorlds}
              adventures={showAdventurePackages ? adventures : []}
              showAdventurePackages={showAdventurePackages}
            />
          )}
          {step === 2 && (
            <StepSettings
              state={state}
              patch={patch}
              onSoloChange={handleSoloChange}
              onPerspectiveChange={handlePerspectiveChange}
              supportsAdvancementPolicy={ruleSupportsAdvancement}
              defaultSceneImage={defaultSceneImage}
              fallbackRuleId={activeRuleIdOf(state)}
            />
          )}
          {step === 3 && (
            <StepCharacters
              players={state.players}
              setPlayers={(players) => patch({ players })}
              cards={cards}
              usesProfessionalBuilder={usesProfessionalBuilder}
              fallbackName={state.gameLanguage === 'en' ? 'Adventurer' : '冒险者'}
            />
          )}
          {step === 4 && (
            <StepConfirm
              state={state}
              worlds={worlds}
              rules={rules}
              showAdventurePackages={showAdventurePackages}
              supportsAdvancementPolicy={ruleSupportsAdvancement}
              adventures={showAdventurePackages ? adventures : []}
              defaultSceneImage={defaultSceneImage}
              fallbackRuleId={activeRuleIdOf(state)}
            />
          )}

          {step3Invalid ? (
            <Text variant="small" className="mt-3 text-destructive">
              {state.players.length === 0 ? t('atLeastOneCharacter') : t('dfCreateNameRequired')}
            </Text>
          ) : null}
          {error ? <Text className="mt-3 text-destructive">{error}</Text> : null}
        </ScrollView>
      )}

      {/* 底部导航 */}
      <View className="mt-2 flex-row gap-2" style={{ paddingBottom: insets.bottom + 8 }}>
        {step > 1 && (
          <Button variant="outline" className="flex-1" disabled={busy} onPress={() => setStep((s) => s - 1)}>
            <Text>{t('previous')}</Text>
          </Button>
        )}
        {step < 4 ? (
          <Button className="flex-1" disabled={busy || catalogLoading || !canNext()} onPress={() => void goNext()}>
            <Text>{busyHint === 'rule' ? t('generatingRule') : t('next')}</Text>
          </Button>
        ) : (
          <Button className="flex-1" disabled={busy || catalogLoading} onPress={() => void create()}>
            <Text>
              {busyHint === 'world' ? t('dfCreateGeneratingWorld') : busy ? t('creating') : t('createAndEnter')}
            </Text>
          </Button>
        )}
      </View>

      {/* 多人自动生成密码展示（创建成功后、进入前） */}
      <Sheet open={generatedPassword !== ''} onClose={dismissPassword} noHandle>
        <View className="gap-4 pb-2">
          <Text variant="h3">{t('roomPassword')}</Text>
          <Text>{t('roomPasswordGenerated', { pwd: generatedPassword })}</Text>
          <Button onPress={dismissPassword}>
            <Text>{t('dfCommonConfirm')}</Text>
          </Button>
        </View>
      </Sheet>
    </Screen>
  )
}
