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
} from '@/api/client'
import { fetchCharacterCards, fetchGameDetail, joinGame, verifyRoomPassword } from '@/api/games'
import type { CharacterCard, CharacterPortrait, GameDetail } from '@/api/types'
import { JoinCharacterForm } from '@/features/join/JoinCharacterForm'
import {
  applyCardToDraft,
  buildJoinNewPayload,
  joinFormReady,
} from '@/lib/join-form'
import { QrScannerSheet } from '@/features/scan/QrScannerSheet'
import { seatUidOf } from '@/lib/player-identity'
import { parseJoinNotice, readCredential, withSeatToken, type JoinNotice } from '@/lib/seat-credentials'
import { parseShareLink, redactShareLink, type ParsedShareLink } from '@/lib/share-link'
import { ServerCompatBlocked, fetchServerCompat, serverCompatErrorText } from '@/lib/server-compat'
import { activeIdentityOf, useSettingsStore } from '@/stores/settings'
import { useT } from '@/i18n/t'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

type Step = 'link' | 'room' | 'identity' | 'done'

/** 解析后进入界面状态的链接：席位凭证已剥离（只进凭证槽位） */
type PublicShareLink = Omit<ParsedShareLink, 'seat'>

export default function JoinScreen() {
  const router = useRouter()
  const t = useT()
  // 路由层在凭证被拒/席位失效时带回来：link 是不含凭证的邀请链接，notice 说明原因
  const params = useLocalSearchParams<{ link?: string; notice?: string }>()
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl)
  const setToken = useSettingsStore((s) => s.setToken)
  const clearShares = useSettingsStore((s) => s.clearShares)
  const upsertShare = useSettingsStore((s) => s.upsertShare)
  const storeSeatToken = useSettingsStore((s) => s.storeSeatToken)
  const storeRoomToken = useSettingsStore((s) => s.storeRoomToken)

  // 输入框只回显剥掉 seat= 的链接：凭证不留在可见状态（截图/录屏/剪贴板历史）
  const [link, setLink] = React.useState(() => (params.link ? redactShareLink(params.link) : ''))
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
  const [cardsLoading, setCardsLoading] = React.useState(false)
  const cardsRequestedRef = React.useRef(false)
  const [step, setStep] = React.useState<Step>('link')
  const [scanning, setScanning] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const keyboardHeight = useKeyboardHeight()
  const mountedRef = React.useRef(true)
  const pendingClientRestoreRef = React.useRef<Parameters<typeof configureApiClient>[0] | null>(null)
  const cooldownTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeRef = React.useRef<JoinNotice | null>(parseJoinNotice(params.notice))
  const autoParsedRef = React.useRef(false)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    }
  }, [])

  // 路由层带着邀请链接回来（凭证被拒、席位失效）：直接解析，省得玩家再找一遍链接
  React.useEffect(() => {
    if (autoParsedRef.current || !params.link) return
    autoParsedRef.current = true
    void parse(params.link)
  }, [params.link])

  // 进入建卡步骤后拉一次本局共享卡库（对齐 Web JoinView loadGameData 的
  // /character-cards 预取）；拉取失败按 Web 语义降级为空列表 → 入口整体隐藏。
  // 非 Owner 在有访问密码的服务器上只拿到插件卡（服务端按身份裁剪）。
  React.useEffect(() => {
    if (step !== 'identity' || mode !== 'create' || !parsed || cardsRequestedRef.current) return
    cardsRequestedRef.current = true
    setCardsLoading(true)
    fetchCharacterCards(parsed.game)
      .then((result) => setCards(result.cards ?? []))
      .catch(() => setCards([]))
      .finally(() => setCardsLoading(false))
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
        share: shareOf(publicLink),
        credentials: seat
          ? withSeatToken(current.shareCredentials, targetBaseUrl, result.game, seat)
          : current.shareCredentials,
      })
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
      configureApiClient({ share: shareOf(publicLink) })
      pendingClientRestoreRef.current = null
      setMode(seat ? 'resume' : 'create')
      await gate(publicLink, gameDetail, !!seat)
    } catch (e) {
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
      pendingClientRestoreRef.current = null
      if (mountedRef.current) {
        setError(e instanceof ServerCompatBlocked ? serverCompatErrorText(e.status, e.config) : errorMessage(e))
      }
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  /**
   * 房间密码门槛：服务端只在持有本局房间令牌后才放行其余请求（Owner 不受限）。
   * 先要密码，再决定找回/新建——否则回访成员也只会被游玩页弹回来。
   */
  async function gate(p: PublicShareLink, gameDetail: GameDetail, seatLink: boolean) {
    const owner = !!useSettingsStore.getState().token
    if (gameDetail.has_room_password && !owner && !hasRoomToken(p.game)) {
      if (noticeRef.current === 'room') setError(t('roomAccessExpired'))
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
    if (p.legacyUser) setError(t('seatLinkExpired'))
    else if (notice === 'seat') setError(t('seatTokenMissing'))
    else if (notice === 'seat-invalid') setError(t('apiErrors.SEAT_TOKEN_INVALID'))
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
    setStep('done')
    router.replace({ pathname: '/play/[gameKey]', params: { gameKey: p.game } })
  }

  /** 加入过程中房间令牌被拒（过期/改密）：回到房间密码步骤重新输入 */
  function backToRoomGate(e: unknown): boolean {
    if (!(e instanceof ApiError) || !e.needsRoomPassword) return false
    setRoomPassword('')
    setStep('room')
    setError(t('roomAccessExpired'))
    return true
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
      {step === 'link' && (
        <View className="gap-3">
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
          ) : (
            <>
              <JoinCharacterForm
                disabled={busy}
                characterName={characterName}
                background={background}
                portrait={portrait}
                selectedCard={joinCard}
                cards={cards}
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
