import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { ChevronDown, ChevronUp, ImagePlus, Sparkles, Trash2, UserRound } from 'lucide-react-native'

import { buildStaticAssetUrl, errorMessage } from '@/api/client'
import { libraryAvatarSource } from '@/api/assets'
import { MAX_AVATAR_BYTES, deleteUserAvatar, listUserAvatars, uploadAvatar, type UserAvatar } from '@/api/avatars'
import { generateAvatarImage } from '@/api/images'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { confirmDestructive } from '@/lib/confirm'
import { builtinPortraitChoices, builtinRuleId, BUILTIN_AVATAR_RULE_IDS, type BuiltinAvatarRuleId } from '@/lib/portraits'
import { useT, type T } from '@/i18n/t'
import type { CharacterPortrait } from '@/api/types'

/** 内置头像按规则分组的展示名（模块级常量只存 key，渲染时经 t() 取文案） */
const RULE_LABEL_KEYS = {
  dnd5e: 'dfCharacterCardRuleLabelDnd5e',
  freeform_coc: 'dfCharacterCardRuleLabelCoc',
  freeform_cyberpunk: 'dfCharacterCardRuleLabelCyberpunk',
  freeform_fantasy: 'dfCharacterCardRuleLabelFantasy',
  freeform_wuxia: 'dfCharacterCardRuleLabelWuxia',
  tavern_free: 'dfCharacterCardRuleLabelTavern',
} as const

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

function mimeOfAsset(asset: { mimeType?: string; uri: string }): string {
  if (asset.mimeType) return asset.mimeType
  const ext = asset.uri.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function ruleLabel(ruleId: BuiltinAvatarRuleId, t: T): string {
  return t(RULE_LABEL_KEYS[ruleId])
}

function BuiltinAvatarGrid({
  ruleId,
  value,
  onPick,
}: {
  ruleId: BuiltinAvatarRuleId
  value: CharacterPortrait | null
  onPick: (id: string) => void
}) {
  const t = useT()
  const choices = builtinPortraitChoices(ruleId)
  return (
    <View className="flex-row flex-wrap gap-2">
      {choices.map((choice) => {
        const selected = value?.kind === 'builtin' && value.id === choice.id
        return (
          <Pressable
            key={choice.id}
            onPress={() => onPick(choice.id)}
            className={`h-12 w-12 overflow-hidden rounded-md border-2 ${selected ? 'border-primary' : 'border-transparent'}`}
            accessibilityLabel={t('dfCharacterCardBuiltinAvatarA11y', { index: choice.index + 1 })}
          >
            <Image
              source={{ uri: buildStaticAssetUrl(choice.assetPath) }}
              className="h-full w-full"
              contentFit="cover"
              recyclingKey={choice.id}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * 角色头像选择区（对齐 Web PortraitPicker 的五种来源：AI 生成 / 内置头像库 /
 * 本机上传 / 我的头像 / 恢复默认）。portrait 状态由父表单持有，保存时随补丁提交。
 */
export function PortraitPickerSection({
  value,
  onChange,
  ruleId,
  name,
}: {
  value: CharacterPortrait | null
  onChange: (portrait: CharacterPortrait | null) => void
  ruleId?: string
  name: string
}) {
  const [prompt, setPrompt] = React.useState('')
  const [generating, setGenerating] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [showAllRules, setShowAllRules] = React.useState(false)
  const [showUserAvatars, setShowUserAvatars] = React.useState(false)
  const [userAvatars, setUserAvatars] = React.useState<UserAvatar[]>([])
  const [userLoading, setUserLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const t = useT()

  const currentRule = builtinRuleId(ruleId)

  async function generate() {
    if (generating) return
    const subject = prompt.trim() || name.trim()
    if (!subject) {
      setError(t('dfCharacterCardGenerateNeedsName'))
      return
    }
    setGenerating(true)
    setError('')
    try {
      const assetId = await generateAvatarImage({ prompt: subject, name, ruleId })
      onChange({ kind: 'generated', asset_id: assetId })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setGenerating(false)
    }
  }

  async function pickAndUpload() {
    if (uploading) return
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError(t('dfCharacterCardGalleryPermissionDenied'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      exif: false,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    const mime = mimeOfAsset(asset)
    if (!ALLOWED_MIME.has(mime)) {
      setError(t('dfCharacterCardAvatarFormatHint'))
      return
    }
    const fileData = asset.base64 ?? ''
    if (!fileData || fileData.length * 0.75 > MAX_AVATAR_BYTES) {
      setError(t('dfCharacterCardAvatarSizeHint'))
      return
    }
    setUploading(true)
    setError('')
    try {
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
      const portrait = await uploadAvatar({
        fileName: asset.fileName || `avatar.${ext}`,
        fileData,
      })
      onChange(portrait)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  async function toggleUserAvatars() {
    const next = !showUserAvatars
    setShowUserAvatars(next)
    if (!next || userLoading) return
    setUserLoading(true)
    try {
      const result = await listUserAvatars()
      setUserAvatars(result.avatars ?? [])
    } catch {
      setUserAvatars([])
    } finally {
      setUserLoading(false)
    }
  }

  async function removeUserAvatar(assetId: string) {
    const ok = await confirmDestructive({
      title: t('dfCharacterCardDeleteAvatarTitle'),
      message: t('dfCharacterCardDeleteAvatarMessage'),
      confirmText: t('dfCommonDelete'),
      cancelText: t('dfCommonCancel'),
    })
    if (!ok) return
    try {
      await deleteUserAvatar(assetId)
      setUserAvatars((items) => items.filter((item) => item.asset_id !== assetId))
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const currentSource = libraryAvatarSource(value)

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="small" className="font-semibold">{t('dfCharacterCardPortrait')}</Text>
        <RemoteAvatar source={currentSource} name={name || '?'} className="h-14 w-14 rounded-full border border-border bg-muted" />
      </View>

      <View className="flex-row items-center gap-2">
        <Input
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t('dfCharacterCardGeneratePlaceholder')}
          className="flex-1"
          returnKeyType="done"
        />
        <Button size="sm" onPress={() => void generate()} disabled={generating}>
          {generating ? <ActivityIndicator size="small" color="white" /> : <Icon as={Sparkles} size={15} />}
          <Text>{generating ? t('dfCharacterCardGenerating') : t('dfCharacterCardGenerate')}</Text>
        </Button>
      </View>
      {/* 原占位文案太长，Android 单行 Input 会折行裁切，说明下沉到这里 */}
      <Text variant="small" className="text-muted-foreground">{t('dfCharacterCardGenerateHint')}</Text>

      <View className="gap-2 rounded-xl border border-border p-2.5">
        <Text variant="small" className="text-muted-foreground">{ruleLabel(currentRule, t)}</Text>
        <BuiltinAvatarGrid
          ruleId={currentRule}
          value={value}
          onPick={(id) => onChange({ kind: 'builtin', id })}
        />
        {showAllRules ? (
          <View className="gap-2 border-t border-border pt-2">
            {BUILTIN_AVATAR_RULE_IDS.filter((rule) => rule !== currentRule).map((rule) => (
              <View key={rule} className="gap-2">
                <Text variant="small" className="text-muted-foreground">{ruleLabel(rule, t)}</Text>
                <BuiltinAvatarGrid
                  ruleId={rule}
                  value={value}
                  onPick={(id) => onChange({ kind: 'builtin', id })}
                />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={uploading} onPress={() => void pickAndUpload()}>
          {uploading ? <ActivityIndicator size="small" /> : <Icon as={ImagePlus} size={15} />}
          <Text>{uploading ? t('dfCharacterCardUploading') : t('dfCharacterCardUpload')}</Text>
        </Button>
        <Button size="sm" variant="outline" onPress={() => void toggleUserAvatars()}>
          <Icon as={UserRound} size={15} /><Text>{t('dfCharacterCardMyAvatars')}</Text>
        </Button>
        <Button size="sm" variant="ghost" onPress={() => onChange(null)}>
          <Text>{t('dfCharacterCardUseDefault')}</Text>
        </Button>
      </View>
      {/* 补 py-1 扩大点击热区，箭头提示可展开/收起 */}
      <Pressable
        onPress={() => setShowAllRules(!showAllRules)}
        className="flex-row items-center gap-1 self-start rounded-md py-1 active:opacity-60"
        accessibilityRole="button"
      >
        <Text variant="small" className="text-muted-foreground underline">{showAllRules ? t('dfCharacterCardCollapseAvatars') : t('dfCharacterCardAllAvatars')}</Text>
        <Icon as={showAllRules ? ChevronUp : ChevronDown} size={13} className="text-muted-foreground" />
      </Pressable>

      {showUserAvatars ? (
        <View className="gap-2 rounded-xl border border-border p-2.5">
          {userLoading ? (
            <ActivityIndicator size="small" className="self-center" />
          ) : userAvatars.length ? (
            <View className="flex-row flex-wrap gap-2">
              {userAvatars.map((avatar) => {
                const selected = value?.kind === 'upload' && value.asset_id === avatar.asset_id
                return (
                  <View key={avatar.asset_id} className="items-center gap-1">
                    <Pressable
                      onPress={() => onChange({ kind: 'upload', asset_id: avatar.asset_id })}
                      className={`h-12 w-12 overflow-hidden rounded-full border-2 ${selected ? 'border-primary' : 'border-border'}`}
                    >
                      <RemoteAvatar
                        source={libraryAvatarSource({ kind: 'upload', asset_id: avatar.asset_id })}
                        name={t('dfCharacterCardAvatarA11y')}
                        className="h-full w-full"
                      />
                    </Pressable>
                    <Pressable onPress={() => void removeUserAvatar(avatar.asset_id)} className="p-0.5">
                      <Icon as={Trash2} size={13} className="text-destructive" />
                    </Pressable>
                  </View>
                )
              })}
            </View>
          ) : (
            <Text variant="small" className="text-muted-foreground">{t('dfCharacterCardNoUploadedAvatars')}</Text>
          )}
        </View>
      ) : null}

      {error ? <Text variant="small" className="text-destructive">{error}</Text> : null}
    </View>
  )
}
