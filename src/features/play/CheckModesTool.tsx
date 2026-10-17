import * as React from 'react'
import { Pressable, View } from 'react-native'

import { ApiError } from '@/api/client'
import { fetchCheckModes, mutateCheckMode } from '@/api/check-modes'
import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import {
  checkModeRequestBody,
  pendingCheckModeSeats,
  visibleCheckModeSeats,
  type CheckMode,
  type CheckModeOperation,
  type CheckModeSeat,
  type CheckModeState,
} from '@/lib/check-modes'
import { useGameStore } from '@/stores/game'

/** 服务端状态码 / 来源码 → 文案；不认识的码原样显示（与上游 modeText 一致） */
const CODE_TEXT: Record<string, TKey> = {
  advantage: 'dfModeAdvantage',
  disadvantage: 'dfModeDisadvantage',
  request: 'dfModeRequest',
  grant: 'dfModeGrant',
  reject: 'dfModeReject',
  pending: 'dfModePending',
  granted: 'dfModeGranted',
  rejected: 'dfModeRejected',
  narrative_round: 'dfModeNarrativeRound',
  combat_attack: 'dfModeCombatAttack',
  checks_prepared: 'dfModeChecksPrepared',
  phase_not_actionable: 'dfModePhaseNotActionable',
  deceased: 'dfModeDeceased',
  combat_required: 'dfModeCombatRequired',
  not_this_seat: 'dfModeNotThisSeat',
  unsupported: 'dfModeUnsupported',
  long_range: 'dfModeLongRange',
  dodging: 'dfModeDodging',
  next_attack_advantage: 'dfModeNextAttackAdvantage',
  faerie_fire: 'dfModeFaerieFire',
  next_attack_disadvantage: 'dfModeNextAttackDisadvantage',
  gm_grant: 'dfModeGmGrant',
}

/** 面板打开期间的轮询间隔（同上游 4s）；关闭时只跟随对局刷新重取，省电 */
const OPEN_POLL_MS = 4000

type Editing = { seat: CheckModeSeat; operation: 'request' | 'grant' | 'reject'; state: CheckModeState }

/**
 * 检定模式工具（对齐上游 CheckModePanel）：行动区的「检定」标签，GM 显示待审数、玩家显示
 * 「等待 GM」；点开后按席位申请优势/劣势，GM 授予/拒绝/清除。旧服务端没有该端点时整块隐藏。
 */
export function CheckModesTool({ gameKey, actorId, isGm }: { gameKey: string; actorId: string; isGm: boolean }) {
  const t = useT()
  // 对局每次刷新（含 SSE table_settings_changed 触发的刷新）都换 detail 引用，借此重取
  const detail = useGameStore((s) => s.detail)
  const [state, setState] = React.useState<CheckModeState | null>(null)
  const [unsupported, setUnsupported] = React.useState(false)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Editing | null>(null)
  const [mode, setMode] = React.useState<CheckMode>('advantage')
  const [reason, setReason] = React.useState('')
  // 切局/卸载后丢弃迟到的响应
  const generation = React.useRef(0)

  const enabled = !!gameKey && (isGm || !!actorId)

  function loaded(current: number, next: CheckModeState) {
    if (current !== generation.current) return
    setState(next)
    setError('')
  }

  function loadFailed(current: number, cause: unknown) {
    if (current !== generation.current) return
    if (cause instanceof ApiError && (cause.status === 404 || cause.status === 405)) setUnsupported(true)
    else setError(t('dfModeError'))
  }

  function load() {
    const current = generation.current
    return fetchCheckModes(gameKey).then((next) => loaded(current, next), (cause: unknown) => loadFailed(current, cause))
  }

  React.useEffect(() => {
    if (!enabled || unsupported) return
    // 回调里才写 state（effect 内不能同步 setState）
    const current = generation.current
    fetchCheckModes(gameKey).then((next) => loaded(current, next), (cause: unknown) => loadFailed(current, cause))
  }, [enabled, unsupported, detail])

  React.useEffect(() => {
    if (!open || !enabled || unsupported) return
    const timer = setInterval(() => {
      if (!busy) void load()
    }, OPEN_POLL_MS)
    return () => clearInterval(timer)
  }, [open, enabled, unsupported, busy])

  React.useEffect(() => () => {
    generation.current += 1
  }, [])

  const gm = state?.is_gm ?? isGm
  const seats = visibleCheckModeSeats(state, actorId, isGm)
  const pending = pendingCheckModeSeats(seats)
  const ownPending = pending.some((seat) => seat.uid === actorId)
  if (!enabled || unsupported || (!seats.length && !error)) return null

  function text(code: string): string {
    const key = CODE_TEXT[code]
    return key ? t(key) : code
  }

  function modeLabel(seat: CheckModeSeat, value: string): string {
    if (!value) return t('dfModeNormal')
    if (seat.kind === 'coc_bonus_penalty') return value === 'advantage' ? t('dfModeBonus') : t('dfModePenalty')
    return text(value)
  }

  async function mutate(seat: CheckModeSeat, operation: CheckModeOperation, snapshot: CheckModeState, draft?: { mode?: CheckMode; reason?: string }) {
    const current = generation.current
    setBusy(true)
    setError('')
    try {
      const next = await mutateCheckMode(gameKey, seat.uid, operation, checkModeRequestBody(snapshot, seat, draft))
      if (current !== generation.current) return
      setState(next)
      setEditing(null)
      setReason('')
      void useGameStore.getState().refresh()
    } catch {
      // 草稿保留：多半是 revision 过期，刷新后可直接重交
      if (current === generation.current) setError(t('dfModeError'))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }

  function startEdit(seat: CheckModeSeat, operation: Editing['operation']) {
    if (!state) return
    setEditing({ seat, operation, state })
    setMode(seat.request?.mode ?? 'advantage')
    setReason(operation === 'grant' ? seat.request?.reason ?? '' : '')
    setError('')
  }

  function submitEdit() {
    if (!editing || !reason.trim()) return
    void mutate(editing.seat, editing.operation, editing.state, {
      mode: editing.operation === 'reject' ? undefined : mode,
      reason: reason.trim(),
    })
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1 self-start rounded-full border border-border px-2.5 py-1 active:bg-accent"
        accessibilityRole="button"
        accessibilityLabel={t('dfModeTitle')}
      >
        <Text variant="small" className="text-muted-foreground">{t('dfModeTool')}</Text>
        {gm && pending.length ? (
          <View className="min-w-5 items-center rounded-full bg-primary px-1.5">
            <Text variant="small" className="font-semibold text-primary-foreground">{pending.length}</Text>
          </View>
        ) : ownPending ? (
          <Text variant="small" className="text-warning">{t('dfModePending')}</Text>
        ) : null}
      </Pressable>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          setEditing(null)
        }}
        scrollable
      >
        <View className="gap-3 pb-2">
          <Text variant="h4">{editing ? `${text(editing.operation)} · ${editing.seat.name}` : t('dfModeTitle')}</Text>

          {editing ? (
            <View className="gap-3">
              {editing.operation !== 'reject' ? (
                <View className="flex-row gap-2" accessibilityRole="radiogroup">
                  {(['advantage', 'disadvantage'] as const).map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      className="flex-1"
                      variant={mode === value ? 'secondary' : 'outline'}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: mode === value }}
                      onPress={() => setMode(value)}
                    >
                      <Text>{modeLabel(editing.seat, value)}</Text>
                    </Button>
                  ))}
                </View>
              ) : null}
              <View className="gap-1">
                <Text variant="small" className="text-muted-foreground">{t('dfModeReason')}</Text>
                <Textarea
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  numberOfLines={3}
                  editable={!busy}
                  accessibilityLabel={t('dfModeReason')}
                />
              </View>
              {error ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{error}</Text> : null}
              <View className="flex-row gap-2">
                <Button className="flex-1" disabled={busy || !reason.trim()} onPress={submitEdit}>
                  <Text>{t('dfModeSubmit')}</Text>
                </Button>
                <Button className="flex-1" variant="outline" disabled={busy} onPress={() => setEditing(null)}>
                  <Text>{t('cancel')}</Text>
                </Button>
              </View>
            </View>
          ) : (
            <>
              <Text variant="muted">{t('dfModeHint')}</Text>
              {error ? (
                <View className="flex-row items-center gap-2">
                  <Text variant="small" className="flex-1 text-destructive" accessibilityRole="alert">{error}</Text>
                  <Button size="sm" variant="outline" disabled={busy} onPress={() => void load()}>
                    <Text>{t('dfModeReload')}</Text>
                  </Button>
                </View>
              ) : null}
              {seats.map((seat) => {
                const blocked = busy || !!seat.blocked_reason
                return (
                  <View key={seat.uid} className="gap-1.5 border-t border-border pt-3">
                    <Text>
                      <Text className="font-semibold">{seat.name}</Text>
                      <Text variant="small" className="text-muted-foreground"> · {text(seat.scope)}</Text>
                    </Text>
                    {seat.request ? (
                      <Text variant="small">
                        {t('dfModeRequest')}: {modeLabel(seat, seat.request.mode)} · {seat.request.reason} · {text(seat.request.status)}
                        {seat.request.decision_reason ? ` · ${seat.request.decision_reason}` : ''}
                      </Text>
                    ) : null}
                    {seat.grant ? (
                      <Text variant="small">
                        {t('dfModeGrant')}: {modeLabel(seat, seat.grant.mode)} · {seat.grant.reason}
                      </Text>
                    ) : null}
                    {seat.previews.map((preview, index) => (
                      <View key={index} className="gap-0.5">
                        <Text variant="small" className="text-muted-foreground">
                          {preview.label}: {modeLabel(seat, preview.mode)}
                        </Text>
                        {preview.sources.map((source, sourceIndex) => (
                          <Text key={sourceIndex} variant="small" className="ml-3 text-muted-foreground">
                            · {text(source.code)} · {modeLabel(seat, source.mode)}{source.reason ? ` · ${source.reason}` : ''}
                          </Text>
                        ))}
                      </View>
                    ))}
                    {seat.blocked_reason ? (
                      <Text variant="small" className="text-muted-foreground">{text(seat.blocked_reason)}</Text>
                    ) : null}
                    <View className="flex-row flex-wrap gap-2">
                      {!gm ? (
                        <Button size="sm" disabled={blocked} onPress={() => startEdit(seat, 'request')}>
                          <Text>{t('dfModeRequest')}</Text>
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" disabled={blocked} onPress={() => startEdit(seat, 'grant')}>
                            <Text>{t('dfModeGrant')}</Text>
                          </Button>
                          {seat.request?.status === 'pending' ? (
                            <Button size="sm" variant="outline" disabled={blocked} onPress={() => startEdit(seat, 'reject')}>
                              <Text>{t('dfModeReject')}</Text>
                            </Button>
                          ) : null}
                          {seat.grant && state ? (
                            <Button size="sm" variant="outline" disabled={blocked} onPress={() => void mutate(seat, 'clear', state)}>
                              <Text>{t('dfModeClear')}</Text>
                            </Button>
                          ) : null}
                        </>
                      )}
                    </View>
                  </View>
                )
              })}
            </>
          )}
        </View>
      </Sheet>
    </>
  )
}
