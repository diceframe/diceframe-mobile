import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import {
  configureApiClient,
  currentSessionToken,
  errorMessage,
  generateSessionToken,
  normalizeBaseUrl,
} from '@/api/client'
import { fetchCharacterCards, fetchGameDetail, joinGame, verifyRoomPassword } from '@/api/games'
import type { CharacterCard, CharacterPortrait, GameDetail } from '@/api/types'
import { JoinCharacterForm } from '@/features/join/JoinCharacterForm'
import {
  applyCardToDraft,
  buildJoinNewPayload,
  joinFormReady,
} from '@/lib/join-form'
import { parseShareLink, type ParsedShareLink } from '@/lib/share-link'
import { useSettingsStore } from '@/stores/settings'
import { useT } from '@/i18n/t'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

type Step = 'link' | 'room' | 'identity' | 'done'

export default function JoinScreen() {
  const router = useRouter()
  const t = useT()
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl)
  const setToken = useSettingsStore((s) => s.setToken)
  const clearShares = useSettingsStore((s) => s.clearShares)
  const upsertShare = useSettingsStore((s) => s.upsertShare)

  const [link, setLink] = React.useState('')
  const [parsed, setParsed] = React.useState<ParsedShareLink | null>(null)
  const [detail, setDetail] = React.useState<GameDetail | null>(null)
  const [roomToken, setRoomToken] = React.useState<string | undefined>(undefined)
  const [roomPassword, setRoomPassword] = React.useState('')
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
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const keyboardHeight = useKeyboardHeight()
  const mountedRef = React.useRef(true)
  const pendingClientRestoreRef = React.useRef<Parameters<typeof configureApiClient>[0] | null>(null)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
    }
  }, [])

  // 进入建卡步骤后拉一次本局共享卡库（对齐 Web JoinView loadGameData 的
  // /character-cards 预取）；拉取失败按 Web 语义降级为空列表 → 入口整体隐藏
  React.useEffect(() => {
    if (step !== 'identity' || !parsed || parsed.user || cardsRequestedRef.current) return
    cardsRequestedRef.current = true
    setCardsLoading(true)
    fetchCharacterCards(parsed.game)
      .then((result) => setCards(result.cards ?? []))
      .catch(() => setCards([]))
      .finally(() => setCardsLoading(false))
  }, [step, parsed])

  async function parse() {
    setError('')
    const result = parseShareLink(link)
    if (!result) {
      setError(t('dfJoinInvalidLink'))
      return
    }
    setBusy(true)
    const targetBaseUrl = normalizeBaseUrl(result.baseUrl)
    const current = useSettingsStore.getState()
    pendingClientRestoreRef.current = {
      baseUrl: current.baseUrl,
      token: current.token,
      share: current.share,
      sessionToken: currentSessionToken(),
    }
    try {
      // 候选服务器使用一次性会话探测，绝不携带当前实例的 Owner/玩家凭据。
      configureApiClient({
        baseUrl: targetBaseUrl,
        token: null,
        sessionToken: generateSessionToken(),
        share: {
          game: result.game,
          user: result.user ?? '',
          name: result.name,
          delegate: result.delegate,
        },
      })
      const gameDetail = await fetchGameDetail(result.game)
      if (!mountedRef.current) return
      setParsed(result)
      setDetail(gameDetail)
      if (targetBaseUrl !== current.baseUrl) {
        setToken(null)
        clearShares()
      }
      setBaseUrl(targetBaseUrl)
      configureApiClient({ share: shareOf(result) })
      pendingClientRestoreRef.current = null
      if (gameDetail.has_room_password) {
        setStep('room')
      } else {
        setStep('identity')
      }
    } catch (e) {
      if (pendingClientRestoreRef.current) configureApiClient(pendingClientRestoreRef.current)
      pendingClientRestoreRef.current = null
      if (mountedRef.current) setError(errorMessage(e))
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  async function verifyRoom() {
    if (!parsed) return
    setBusy(true)
    setError('')
    try {
      const token = await verifyRoomPassword(parsed.game, roomPassword)
      setRoomToken(token)
      configureApiClient({ share: { ...shareOf(parsed), roomToken: token } })
      setStep('identity')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function shareOf(p: ParsedShareLink, userId?: string) {
    return {
      game: p.game,
      user: userId ?? p.user ?? '',
      name: p.name,
      delegate: p.delegate,
      roomToken,
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

  async function join() {
    if (!parsed) return
    if (!parsed.user && !joinFormReady(characterName)) {
      setError(t('dfJoinNameRequired'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = parsed.user
        ? await joinGame(parsed.game, { user_id: parsed.user, join_as_new: false })
        : await joinGame(
            parsed.game,
            // 简化版建卡 payload：姓名/背景/头像来自草稿，库卡 sheet 字段整卡透传
            buildJoinNewPayload({ characterName, background, portrait }, joinCard),
          )
      if (!result.user_id) throw new Error(result.error || t('dfJoinFailed'))
      // 写入该局自己的槽位并设为当前注入：已有别的局身份时不再整体覆盖，
      // 多局身份各自保留（对齐 Web 端 trpg_play_user_<gameKey> 的每局缓存）
      const share = {
        ...shareOf(parsed, result.user_id),
        // 快照加入时的服务器与对局名，供启动分流/身份列表区分展示
        server: parsed.baseUrl,
        worldName: detail?.world_name,
      }
      upsertShare(share)
      setStep('done')
      router.replace({ pathname: '/play/[gameKey]', params: { gameKey: parsed.game } })
    } catch (e) {
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
          <Button onPress={parse} disabled={busy}>
            {busy ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <Text>{t('dfJoinParse')}</Text>
            )}
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
          <Button onPress={verifyRoom} disabled={busy || !roomPassword}>
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
          {parsed.user ? (
            <>
              <Text variant="muted">
                {t('dfJoinReclaimHint', { name: parsed.name || parsed.user })}
              </Text>
              <Button onPress={join} disabled={busy}>
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
              <Button onPress={join} disabled={busy || !joinFormReady(characterName)}>
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
    </Screen>
  )
}


