import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Button, ButtonText } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { configureApiClient, errorMessage } from '@/api/client'
import { fetchGameDetail, joinGame, verifyRoomPassword } from '@/api/games'
import type { GameDetail } from '@/api/types'
import { parseShareLink, type ParsedShareLink } from '@/lib/share-link'
import { useSettingsStore } from '@/stores/settings'
import { strings } from '@/lib/strings'
import { useKeyboardHeight } from '@/lib/use-keyboard-height'

type Step = 'link' | 'room' | 'identity' | 'done'

export default function JoinScreen() {
  const router = useRouter()
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl)
  const setShare = useSettingsStore((s) => s.setShare)

  const [link, setLink] = React.useState('')
  const [parsed, setParsed] = React.useState<ParsedShareLink | null>(null)
  const [detail, setDetail] = React.useState<GameDetail | null>(null)
  const [roomToken, setRoomToken] = React.useState<string | undefined>(undefined)
  const [roomPassword, setRoomPassword] = React.useState('')
  const [characterName, setCharacterName] = React.useState('')
  const [step, setStep] = React.useState<Step>('link')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const keyboardHeight = useKeyboardHeight()

  async function parse() {
    setError('')
    const result = parseShareLink(link)
    if (!result) {
      setError(strings.join.invalidLink)
      return
    }
    setBusy(true)
    try {
      // 先用候选身份直连探测，成功后再持久化
      configureApiClient({
        baseUrl: result.baseUrl,
        share: { game: result.game, user: result.user ?? '', name: result.name },
      })
      const gameDetail = await fetchGameDetail(result.game)
      setParsed(result)
      setDetail(gameDetail)
      setBaseUrl(result.baseUrl)
      if (gameDetail.has_room_password) {
        setStep('room')
      } else {
        setStep('identity')
      }
    } catch (e) {
      configureApiClient({ share: null })
      setError(errorMessage(e))
    } finally {
      setBusy(false)
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

  async function join() {
    if (!parsed) return
    if (!parsed.user && !characterName.trim()) {
      setError('请填写角色名')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = parsed.user
        ? await joinGame(parsed.game, { user_id: parsed.user, join_as_new: false })
        : await joinGame(parsed.game, {
            join_as_new: true,
            character_name: characterName.trim(),
          })
      if (!result.user_id) throw new Error(result.error || '加入失败')
      const share = shareOf(parsed, result.user_id)
      setShare(share)
      setStep('done')
      router.replace({ pathname: '/play/[gameKey]', params: { gameKey: parsed.game } })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="px-4">
      <PageHeader
        title={strings.join.title}
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
          <Text variant="small">{strings.join.linkLabel}</Text>
          <Input
            value={link}
            onChangeText={setLink}
            placeholder={strings.join.linkPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!busy}
          />
          <Button onPress={parse} disabled={busy}>
            {busy ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <ButtonText>{strings.join.parse}</ButtonText>
            )}
          </Button>
        </View>
      )}

      {step === 'room' && (
        <View className="gap-3">
          <Text variant="small">{strings.join.roomPasswordLabel}</Text>
          <Input
            value={roomPassword}
            onChangeText={setRoomPassword}
            placeholder={strings.join.roomPasswordPlaceholder}
            secureTextEntry
            editable={!busy}
          />
          <Button onPress={verifyRoom} disabled={busy || !roomPassword}>
            {busy ? (
              <ActivityIndicator className="text-primary-foreground" />
            ) : (
              <ButtonText>{strings.join.verify}</ButtonText>
            )}
          </Button>
        </View>
      )}

      {step === 'identity' && parsed && (
        <View className="gap-3">
          {parsed.user ? (
            <>
              <Text variant="muted">
                将找回角色：{parsed.name || parsed.user}
              </Text>
              <Button onPress={join} disabled={busy}>
                {busy ? (
                  <ActivityIndicator className="text-primary-foreground" />
                ) : (
                  <ButtonText>{strings.join.reclaimIdentity}</ButtonText>
                )}
              </Button>
            </>
          ) : (
            <>
              <Text variant="small">{strings.join.newNameLabel}</Text>
              <Input
                value={characterName}
                onChangeText={setCharacterName}
                placeholder={strings.join.newNamePlaceholder}
                editable={!busy}
              />
              <Button onPress={join} disabled={busy}>
                {busy ? (
                  <ActivityIndicator className="text-primary-foreground" />
                ) : (
                  <ButtonText>{strings.join.createCharacter}</ButtonText>
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
