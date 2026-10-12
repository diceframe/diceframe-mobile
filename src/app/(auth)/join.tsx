import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ScanLine } from 'lucide-react-native'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import {
  ApiError,
  configureApiClient,
  currentSessionToken,
  errorMessage,
  generateSessionToken,
  hasRoomToken,
  normalizeBaseUrl,
  retryOnRateLimit,
  setJoinShare,
} from '@/api/client'
import { fetchCharacterCards, fetchGameDetail, joinGame, verifyRoomPassword } from '@/api/games'
import type { CharacterCard, CharacterPortrait, GameDetail } from '@/api/types'
import { JoinCharacterForm } from '@/features/join/JoinCharacterForm'
import { loadLocalJoinCards } from '@/hooks/useLocalCards'
import {
  applyCardToDraft,
  buildJoinNewPayload,
  joinFormReady,
} from '@/lib/join-form'
import { QrScannerSheet } from '@/features/scan/QrScannerSheet'
import { seatUidOf } from '@/lib/player-identity'
import { isDelegateFlag, parseJoinNotice, readCredential, withSeatToken, type JoinNotice } from '@/lib/seat-credentials'
import {
  joinLinkAutoParseAllowed,
  parseShareLink,
  redactShareLink,
  serverSwitchTarget,
  type ParsedShareLink,
} from '@/lib/share-link'
import { confirmDestructive } from '@/lib/confirm'
import { joinLinkFromParams } from '@/lib/join-deep-link'
import { cardsFailureNeedsRoomGate } from '@/lib/join-room-gate'
import { ServerCompatBlocked, fetchServerCompat, serverCompatErrorText } from '@/lib/server-compat'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'
import { useT } from '@/i18n/t'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

type Step = 'link' | 'room' | 'identity' | 'done'

/**
 * 页面顶部的说明横幅（不是错误）：席位凭证失效 / 缺失 / 旧链接、房间访问过期。
 * seat 类时「找 GM 要新链接」是主要出路，新建角色收起为次要操作，免得玩家顺手建出重复席位。
 */
type JoinBanner = { kind: 'seat' | 'room'; text: string }

/** 解析后进入界面状态的链接：席位凭证已剥离（只进凭证槽位） */
type PublicShareLink = Omit<ParsedShareLink, 'seat'>

export default function JoinScreen() {
  const router = useRouter()
  const t = useT()
  // 路由层在凭证被拒/席位失效时带回来：link 是不含凭证的邀请链接，notice 说明原因
  const params = useLocalSearchParams<{ link?: string; link64?: string; notice?: string }>()
  // 邀请链接经 link64 传入（深链与 App 内跳转都不会被路由层按 # 截断，见 lib/join-deep-link）
  const incomingLink = joinLinkFromParams(params)
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl)
  const setToken = useSettingsStore((s) => s.setToken)
  const clearShares = useSettingsStore((s) => s.clearShares)
  const upsertShare = useSettingsStore((s) => s.upsertShare)
  const storeSeatToken = useSettingsStore((s) => s.storeSeatToken)
  const storeRoomToken = useSettingsStore((s) => s.storeRoomToken)

  // 输入框只回显剥掉 seat= 的链接：凭证不留在可见状态（截图/录屏/剪贴板历史）
  const [link, setLink] = React.useState(() => (incomingLink ? redactShareLink(incomingLink) : ''))
  const [parsed, setParsed] = React.useState<PublicShareLink | null>(null)
  const [detail, setDetail] = React.useState<GameDetail | null>(null)
  const [roomPassword, setRoomPassword] = React.useState('')
  // 房间密码限流（429 + retry_after）期间禁用验证按钮，提示里给出等待秒数
  const [roomCoolingDown, setRoomCoolingDown] = React.useState(false)
  // create = 新建角色；resume = GM 接管链接找回已有席位
  const [mode, setMode] = React.useState<'create' | 'resume'>('create')
  const [characterName, setCharacterName] = React.useState('')
  // 建卡草稿扩展项：背景 / 头像（undefined = 未设置，payload 不下发）/ 所选库卡
  const [background, setBackground] = React.useState('')
  const [portrait, setPortrait] = React.useState<CharacterPortrait | null | undefined>(undefined)
  const [joinCard, setJoinCard] = React.useState<CharacterCard | null>(null)
  // 本局共享卡库；null = 尚未拉取（进入 identity 步骤后拉一次）
  const [cards, setCards] = React.useState<CharacterCard[]>([])
  // 本机角色库里的卡（离线内容库）：玩家不必推送，直接用它建卡加入
  const [localCards, setLocalCards] = React.useState<CharacterCard[]>([])
  const [cardsLoading, setCardsLoading] = React.useState(false)
  const cardsRequestedRef = React.useRef(false)
  const [step, setStep] = React.useState<Step>('link')
  const [scanning, setScanning] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [banner, setBanner] = React.useState<JoinBanner | null>(null)
  // seat 类横幅下，新建角色表单默认收起，用户明确选择后才展开
  const [createAnyway, setCreateAnyway] = React.useState(false)
  const keyboardHeight = useKeyboardHeight()
  const mountedRef = React.useRef(true)
  const pendingClientRestoreRef = React.useRef<Parameters<typeof configureApiClient>[0] | null>(null)
  const cooldownTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeRef = React.useRef<JoinNotice | null>(parseJoinNotice(params.notice))
  const autoParsedRef = React.useRef(false)
  // 深链带来的链接指向别的服务器时不自动解析，只预填并提示目标主机，由用户明确操作
  const [foreignLinkHost] = React.useState(() =>
    incomingLink && !joinLinkAutoParseAllowed(incomingLink, useSettingsStore.getState().baseUrl)
      ? serverSwitchTarget(incomingLink, useSettingsStore.getState().baseUrl)
      : null,
  )

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
      // 离开加入页（返回、或进入对局后被替换）：结束加入流程的临时分享身份
      setJoinShare(null)
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    }
  }, [])

  // 路由层带着邀请链接回来（凭证被拒、席位失效）：直接解析，省得玩家再找一遍链接。
  // 这个路由也能被任意网页经 diceframe:// 深链拉起，所以只自动解析指向当前服务器、
  // 且不带席位凭证的链接；其余只预填输入框，等用户明确点击（切服务器还要再确认）。
  React.useEffect(() => {
    if (autoParsedRef.current || !incomingLink) return
    autoParsedRef.current = true
    if (!joinLinkAutoParseAllowed(incomingLink, useSettingsStore.getState().baseUrl)) return
    void parse(incomingLink)
  }, [incomingLink])

  // 进入建卡步骤后拉一次本局共享卡库（对齐 Web JoinView loadGameData 的
  // /character-cards 预取）；拉取失败按 Web 语义降级为空列表 → 入口整体隐藏。
  // 非 Owner 在有访问密码的服务器上只拿到插件卡（服务端按身份裁剪）。
  React.useEffect(() => {
    if (step !== 'identity' || mode !== 'create' || !parsed || cardsRequestedRef.current) return
    cardsRequestedRef.current = true
    setCardsLoading(true)
    Promise.all([
      fetchCharacterCards(parsed.game)
        .then((result) => setCards(result.cards ?? []))
        .catch((cause: unknown) => {
          setCards([])
          // 房间访问失效（改了房间密码 / 令牌过期）不是「没有可选的卡」：回房间密码步骤
          if (mountedRef.current && cardsFailureNeedsRoomGate(cause, !!detail?.has_room_password, hasRoomToken(parsed.game))) {
            cardsRequestedRef.current = false
            showRoomGate()
          }
        }),
      loadLocalJoinCards()
        .then(setLocalCards)
        .catch(() => setLocalCards([])),
    ]).finally(() => setCardsLoading(false))
  }, [step, mode, parsed])

  function shareOf(p: PublicShareLink, userId?: string) {
    return {
      game: p.game,
      user: userId ?? '',
      name: p.name,
      delegate: p.delegate,
    }
  }

  async function parse(rawLink?: string) {
    setError('')
    // 扫码结果要立刻可用：setState 是异步的，这一轮还读不到新值，所以直接传入
    const input = rawLink ?? link
    setLink(redactShareLink(input))
    const result = parseShareLink(input)
    if (!result) {
      setError(t('dfJoinInvalidLink'))
      return
    }
    const { seat, ...publicLink } = result
    // 切到另一台服务器会登出房主、清掉本机玩家身份：先让用户看清目标主机并确认
    const switchTarget = serverSwitchTarget(input, useSettingsStore.getState().baseUrl)
    if (switchTarget) {
      const confirmed = await confirmDestructive({
        title: t('dfJoinSwitchServerTitle'),
        message: t('dfJoinSwitchServerMessage', { host: switchTarget }),
        confirmText: t('dfJoinSwitchServerConfirm'),
        cancelText: t('dfCommonCancel'),
      })
      if (!confirmed || !mountedRef.current) return
    }
    setBusy(true)
    const targetBaseUrl = normalizeBaseUrl(result.baseUrl)
    const current = useSettingsStore.getState()
    pendingClientRestoreRef.current = {
      baseUrl: current.baseUrl,
      token: current.token,
      share: activeIdentityOf(current),
      sessionToken: currentSessionToken(),
      credentials: current.shareCredentials,
    }
    try {
      // 候选服务器使用一次性会话探测，绝不携带当前实例的 Owner/玩家凭据。
      // 接管链接里的席位凭证只挂在「目标后端 + 该局」槽位上，探测成功后才落盘。
      configureApiClient({
        baseUrl: targetBaseUrl,
        token: null,
        sessionToken: generateSessionToken(),
        credentials: seat
          ? withSeatToken(current.shareCredentials, targetBaseUrl, result.game, seat)
          : current.shareCredentials,
      })
      // 加入流程的分享身份单独挂在 client 上：之后写 settings（服务器地址、房间令牌、
      // 席位凭证）会重新同步 share，但不会抹掉它——否则详情与 POST /players 会以
      // 非分享请求发出，有访问密码的服务器直接 401。
      setJoinShare(shareOf(publicLink))
      // 双向版本兼容：先于对局详情探测，不兼容直接拦在链接解析这一步
      // （拿不到版本号按服务器过旧拦下；探测失败按 joinGame 的既有错误路径走）
      const probe = await fetchServerCompat()
      // 非 ok 一律拦下：判定结论以后再加一种也默认是阻断，不会悄悄放行
      if (probe.status !== 'ok') throw new ServerCompatBlocked(probe.status, probe.config)
      const gameDetail = await fetchGameDetail(result.game)
      if (!mountedRef.current) return
      setParsed(publicLink)
      setDetail(gameDetail)
      if (targetBaseUrl !== current.baseUrl) {
        setToken(null)
        clearShares()
      }
      setBaseUrl(targetBaseUrl)
      if (seat) storeSeatToken(targetBaseUrl, result.game, seat)
      pendingClientRestoreRef.current = null
      setMode(seat ? 'resume' : 'create')
      await gate(publicLink, gameDetail, !!seat)
    } catch (e) {
      if (pendingClientRestoreRef.current) {
        configureApiClient(pendingClientRestoreRef.current)
        setJoinShare(null)
      }
      pendingClientRestoreRef.current = null
      if (mountedRef.current) {
        setError(e instanceof ServerCompatBlocked ? serverCompatErrorText(e.status, e.config) : errorMessage(e))
      }
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  /**
   * 房间密码门槛：服务端只在持有本局房间令牌后才放行其余请求。
   * 先要密码，再决定找回/新建——否则回访成员也只会被游玩页弹回来。
   * 同一设备登录了房主也一样：玩家身份与房主身份独立，加入请求不带房主凭据；
   * 只有 delegate 代操作链接以房主身份发出，不受房间密码约束。
   */
  async function gate(p: PublicShareLink, gameDetail: GameDetail, seatLink: boolean) {
    const ownerDelegate = !!useSettingsStore.getState().token && isDelegateFlag(p.delegate)
    if (gameDetail.has_room_password && !ownerDelegate && !hasRoomToken(p.game)) {
      if (noticeRef.current === 'room') setBanner({ kind: 'room', text: t('roomAccessExpired') })
      setStep('room')
      return
    }
    await continueJoin(p, gameDetail, seatLink)
  }

  async function continueJoin(p: PublicShareLink, gameDetail: GameDetail, seatLink: boolean) {
    if (seatLink) {
      setMode('resume')
      setStep('identity')
      return
    }
    // 本机持有的席位凭证仍有效：服务端按该席位投影详情（viewer.kind = seat），直接回到对局
    const seatUid = seatUidOf(gameDetail)
    if (seatUid) {
      enterAs(p, seatUid, gameDetail)
      return
    }
    const notice = noticeRef.current
    if (p.legacyUser) setBanner({ kind: 'seat', text: t('seatLinkExpired') })
    else if (notice === 'seat') setBanner({ kind: 'seat', text: t('seatTokenMissing') })
    else if (notice === 'seat-invalid') setBanner({ kind: 'seat', text: t('apiErrors.SEAT_TOKEN_INVALID') })
    setMode('create')
    setStep('identity')
  }

  function enterAs(p: PublicShareLink, userId: string, gameDetail: GameDetail | null) {
    // 写入该局自己的槽位并设为当前注入：已有别的局身份时不再整体覆盖，
    // 多局身份各自保留（对齐 Web 端 trpg_play_user_<gameKey> 的每局缓存）
    upsertShare({
      ...shareOf(p, userId),
      // 快照加入时的服务器与对局名，供启动分流/身份列表区分展示
      server: p.baseUrl,
      worldName: gameDetail?.world_name,
    })
    // 身份已写入 settings 并成为当前注入：加入流程的临时身份到此结束
    setJoinShare(null)
    setStep('done')
    router.replace({ pathname: '/play/[gameKey]', params: { gameKey: p.game } })
  }

  /** 加入过程中房间令牌被拒（过期/改密）：回到房间密码步骤重新输入 */
  function backToRoomGate(e: unknown): boolean {
    if (!(e instanceof ApiError) || !e.needsRoomPassword) return false
    showRoomGate()
    return true
  }

  function showRoomGate() {
    setRoomPassword('')
    setStep('room')
    setBanner({ kind: 'room', text: t('roomAccessExpired') })
  }

  function startRoomCooldown(seconds: number) {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    setRoomCoolingDown(true)
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null
      if (mountedRef.current) setRoomCoolingDown(false)
    }, seconds * 1000)
  }

  async function verifyRoom() {
    if (!parsed || roomCoolingDown) return
    setBusy(true)
    setError('')
    try {
      const token = await verifyRoomPassword(parsed.game, roomPassword)
      storeRoomToken(useSettingsStore.getState().baseUrl, parsed.game, token)
      setRoomPassword('')
      if (banner?.kind === 'room') setBanner(null)
      // 有房间密码时大厅视图藏着场景与成员投影，拿到令牌后重取一次再决定找回/新建
      let fresh = detail
      try {
        fresh = await fetchGameDetail(parsed.game)
        if (mountedRef.current) setDetail(fresh)
      } catch {
        // 保留已有大厅信息；场景只是装饰
      }
      if (fresh) await continueJoin(parsed, fresh, mode === 'resume')
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && e.retryAfter) startRoomCooldown(e.retryAfter)
      // 409 room_password_changed：校验期间 GM 改了密码，清空输入重新来过
      if (e instanceof ApiError && e.status === 409) setRoomPassword('')
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  /** 选卡 / 清卡：卡值立即拷入草稿（对齐 Web applyCard），之后仍可手改，提交以草稿为准 */
  function selectCard(card: CharacterCard | null) {
    setJoinCard(card)
    if (!card) return
    const merged = applyCardToDraft({ characterName, background, portrait }, card)
    setCharacterName(merged.characterName)
    setBackground(merged.background)
    setPortrait(merged.portrait)
  }

  /** GM 接管链接：凭席位凭证找回已有席位（服务端顺带把本机会话改绑到该席位） */
  async function resume() {
    if (!parsed) return
    const baseUrl = useSettingsStore.getState().baseUrl
    const seatToken = readCredential(useSettingsStore.getState().shareCredentials, baseUrl, parsed.game).seat
    if (!seatToken) {
      // 没有凭证就会悄悄变成新建席位，宁可让玩家去要新链接
      setError(t('seatTokenMissing'))
      setMode('create')
      return
    }
    setBusy(true)
    setError('')
    try {
      // 找回已有席位是幂等的，短时限流重试一次
      const result = await retryOnRateLimit(() => joinGame(parsed.game, { join_as_new: false }, { seatToken }))
      if (!result.user_id) throw new Error(result.error || t('dfJoinFailed'))
      storeSeatToken(baseUrl, parsed.game, result.seat_token)
      enterAs(parsed, result.user_id, detail)
    } catch (e) {
      if (backToRoomGate(e)) return
      // 凭证已被 GM 重新签发：client 已清掉它，改走新建流程并说明原因
      if (e instanceof ApiError && e.code === 'SEAT_TOKEN_INVALID') setMode('create')
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!parsed) return
    if (!joinFormReady(characterName)) {
      setError(t('dfJoinNameRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await joinGame(
        parsed.game,
        // 简化版建卡 payload：姓名/背景/头像来自草稿，库卡 sheet 字段整卡透传
        buildJoinNewPayload({ characterName, background, portrait }, joinCard),
      )
      if (!result.user_id) throw new Error(result.error || t('dfJoinFailed'))
      // 新席位的凭证只在这次响应里出现一次：先落盘再注入身份，进对局的第一批请求就带上它
      storeSeatToken(useSettingsStore.getState().baseUrl, parsed.game, result.seat_token)
      enterAs(parsed, result.user_id, detail)
    } catch (e) {
      if (backToRoomGate(e)) return
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      className="px-4"
      style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}
    >
      <PageHeader
        title={t('dfJoinTitle')}
        subtitle={detail?.world_name}
        onBack={() => router.back()}
        className="px-0"
      />

      {/* 键盘避让：底部垫高键盘实际高度，表单区可滚动（见 use-keyboard-height 注释） */}
      <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center gap-6"
          keyboardShouldPersistTaps="handled"
        >
      {banner ? (
        <View className="gap-1 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <Text className="font-semibold text-destructive">{banner.text}</Text>
          {banner.kind === 'seat' ? <Text variant="small">{t('dfJoinSeatBannerHint')}</Text> : null}
        </View>
      ) : null}
      {step === 'link' && (
        <View className="gap-3">
          {foreignLinkHost ? (
            <Text className="text-destructive">{t('dfJoinOtherServerNotice', { host: foreignLinkHost })}</Text>
          ) : null}
          <Text variant="small">{t('dfJoinLinkLabel')}</Text>
          <Input
            value={link}
            onChangeText={setLink}
            placeholder={t('dfJoinLinkPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!busy}
          />
          <Button onPress={() => void parse()} disabled={busy}>
            {busy ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <Text>{t('dfJoinParse')}</Text>
            )}
          </Button>
          {/* GM 在 Web 端「邀请链接」里出示的二维码，扫一下免去粘贴 */}
          <Button variant="outline" onPress={() => setScanning(true)} disabled={busy}>
            <ScanLine size={18} />
            <Text>{t('dfScanJoinAction')}</Text>
          </Button>
        </View>
      )}

      {step === 'room' && (
        <View className="gap-3">
          <Text variant="small">{t('roomPassword')}</Text>
          <Input
            value={roomPassword}
            onChangeText={setRoomPassword}
            placeholder={t('dfJoinRoomPasswordPlaceholder')}
            secureTextEntry
            editable={!busy}
          />
          <Button onPress={verifyRoom} disabled={busy || roomCoolingDown || !roomPassword}>
            {busy ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <Text>{t('dfJoinVerify')}</Text>
            )}
          </Button>
        </View>
      )}

      {step === 'identity' && parsed && (
        <View className="gap-3">
          {mode === 'resume' ? (
            <>
              <Text variant="muted">
                {busy ? t('restoringViaLink') : t('dfJoinSeatLinkHint')}
              </Text>
              <Button onPress={resume} disabled={busy}>
                {busy ? (
                  <ActivityIndicator className="text-primary-foreground" />
                ) : (
                  <Text>{t('dfJoinReclaim')}</Text>
                )}
              </Button>
            </>
          ) : banner?.kind === 'seat' && !createAnyway ? (
            <Button variant="outline" onPress={() => setCreateAnyway(true)} disabled={busy}>
              <Text>{t('dfJoinCreateAnyway')}</Text>
            </Button>
          ) : (
            <>
              <JoinCharacterForm
                disabled={busy}
                characterName={characterName}
                background={background}
                portrait={portrait}
                selectedCard={joinCard}
                cards={cards}
                localCards={localCards}
                gameRuleId={detail?.rule_id ? String(detail.rule_id) : undefined}
                cardsLoading={cardsLoading}
                onChangeCharacterName={setCharacterName}
                onChangeBackground={setBackground}
                onChangePortrait={setPortrait}
                onSelectCard={selectCard}
              />
              <Button onPress={create} disabled={busy || !joinFormReady(characterName)}>
                {busy ? (
                  <ActivityIndicator className="text-primary-foreground" />
                ) : (
                  <Text>{t('dfJoinCreateCharacter')}</Text>
                )}
              </Button>
            </>
          )}
        </View>
      )}

      {error ? <Text className="text-destructive">{error}</Text> : null}
        </ScrollView>
      </View>

      <QrScannerSheet
        visible={scanning}
        title={t('dfScanJoinTitle')}
        hint={t('dfScanJoinHint')}
        onScanned={(value) => {
          setScanning(false)
          // parse 内部只回填剥掉 seat= 的链接，扫到的原文不进输入框
          void parse(value)
        }}
        onClose={() => setScanning(false)}
      />
    </Screen>
  )
}
