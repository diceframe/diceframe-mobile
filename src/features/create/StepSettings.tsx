import * as React from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { ChevronDown, ChevronUp, ImagePlus, RefreshCw } from 'lucide-react-native'

import { Input } from '@/components/ui/input'
import { SceneCover } from '@/components/patterns/scene-cover'
import { SheetSelect } from '@/components/patterns/sheet-select'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Text } from '@/components/ui/text'
import { uploadMapBackground, uploadSceneImage } from '@/api/games'
import { worldCoverSource } from '@/api/assets'
import type { SceneImageRef } from '@/api/types'
import { Field } from '@/features/create/field'
import type { CreateFormState, NarrativePerspective } from '@/features/create/payload'
import { BUILTIN_MAP_BACKGROUNDS, mapBackgroundOf, mapBackgroundValue } from '@/lib/map-background'
import { useT } from '@/i18n/t'
import { cn } from '@/lib/utils'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function mimeOfAsset(asset: { mimeType?: string; uri: string }): string {
  if (asset.mimeType) return asset.mimeType
  const ext = asset.uri.split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

type UploadError = 'permission' | 'format' | 'size'

/** 相册选图 → base64/格式/大小校验 → 上传拿引用（场景图与地图背景共用） */
async function pickAndUpload(
  upload: (fileName: string, fileData: string) => Promise<void>,
  onError: (code: UploadError) => void,
): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    onError('permission')
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
    onError('format')
    return
  }
  const fileData = asset.base64 ?? ''
  if (!fileData || fileData.length * 0.75 > MAX_IMAGE_BYTES) {
    onError('size')
    return
  }
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  await upload(asset.fileName || `image.${ext}`, fileData)
}

const PERSPECTIVE_CARDS = [
  { key: 'immersive', labelKey: 'narrativeImmersive', hintKey: 'narrativeImmersiveHint' },
  { key: 'third_person', labelKey: 'narrativeThirdPerson', hintKey: 'narrativeThirdPersonHint' },
] as const

/** 第 2 步：游戏设置（模式/难度/视角/升级政策/房间密码/场景图/地图背景） */
export function StepSettings({
  state,
  patch,
  onSoloChange,
  onPerspectiveChange,
  supportsAdvancementPolicy,
  defaultSceneImage,
  fallbackRuleId,
}: {
  state: CreateFormState
  patch: (partial: Partial<CreateFormState>) => void
  /** 单人切换时联动默认视角（用户未手动改过视角，联动由向导判断） */
  onSoloChange: (solo: boolean) => void
  onPerspectiveChange: (perspective: NarrativePerspective) => void
  supportsAdvancementPolicy: boolean
  /** 世界/规则的默认场景图引用（未上传自定义时展示它） */
  defaultSceneImage?: SceneImageRef | null
  fallbackRuleId?: string
}) {
  const t = useT()
  const [uploading, setUploading] = React.useState<'scene' | 'map' | null>(null)
  const [uploadError, setUploadError] = React.useState('')
  const [mapAdvanced, setMapAdvanced] = React.useState(false)
  const seedActive = !!state.seed.trim()

  const previewSource = worldCoverSource(state.sceneImage ?? defaultSceneImage, fallbackRuleId)

  function errorText(code: UploadError): string {
    if (code === 'permission') return t('dfCreateGalleryPermissionDenied')
    if (code === 'format') return t('dfCreateImageFormatHint')
    return t('dfCreateImageTooLarge')
  }

  function handleUploadError(code: UploadError) {
    setUploadError(errorText(code))
  }

  async function uploadScene(fileName: string, fileData: string) {
    const reference = await uploadSceneImage(fileName, fileData)
    patch({ sceneImage: reference })
  }

  async function uploadMap(fileName: string, fileData: string) {
    const selection = await uploadMapBackground(fileName, fileData)
    patch({ mapBackground: selection })
  }

  function runUpload(kind: 'scene' | 'map') {
    setUploadError('')
    setUploading(kind)
    void pickAndUpload(kind === 'scene' ? uploadScene : uploadMap, handleUploadError)
      .catch((cause: unknown) => setUploadError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setUploading(null))
  }

  const mapValue = mapBackgroundValue(state.mapBackground)
  const mapCustomUploaded = state.mapBackground?.kind === 'upload'

  return (
    <View className="gap-4">
      <Field label={t('gameMode')}>
        <Tabs value={state.solo ? 'solo' : 'multi'} onValueChange={(v) => onSoloChange(v === 'solo')}>
          <TabsList>
            <TabsTrigger value="solo"><Text variant="small">{t('solo')}</Text></TabsTrigger>
            <TabsTrigger value="multi"><Text variant="small">{t('multiplayer')}</Text></TabsTrigger>
          </TabsList>
        </Tabs>
      </Field>

      {!seedActive && (
        <Field label={t('difficulty')}>
          {/* 值直接用服务端中文枚举（与规则模板 difficulty_instructions 键一致） */}
          <Tabs value={state.difficulty} onValueChange={(v) => patch({ difficulty: v })}>
            <TabsList>
              <TabsTrigger value="轻松"><Text variant="small">{t('easy')}</Text></TabsTrigger>
              <TabsTrigger value="标准"><Text variant="small">{t('normal')}</Text></TabsTrigger>
              <TabsTrigger value="硬核"><Text variant="small">{t('hardcore')}</Text></TabsTrigger>
            </TabsList>
          </Tabs>
        </Field>
      )}

      <Field label={t('narrativePerspective')}>
        <View className="gap-2">
          {PERSPECTIVE_CARDS.map((card) => {
            const active = state.narrativePerspective === card.key
            return (
              <Pressable
                key={card.key}
                onPress={() => onPerspectiveChange(card.key)}
                className={cn('rounded-lg border p-3', active ? 'border-primary bg-primary/10' : 'border-border bg-card')}
                accessibilityState={{ selected: active }}
              >
                <Text variant="small" className={active ? 'font-semibold text-primary' : 'font-semibold'}>
                  {t(card.labelKey)}
                </Text>
                <Text variant="small" className="mt-0.5 text-muted-foreground">{t(card.hintKey)}</Text>
              </Pressable>
            )
          })}
        </View>
      </Field>

      {!seedActive && supportsAdvancementPolicy && (
        <>
          <Field
            label={t('advancementMode')}
            hint={state.advancementMode === 'milestone' ? t('advancementMilestoneHint') : t('advancementXpHint')}
          >
            <SheetSelect
              options={[
                { value: 'milestone', label: t('advancementMilestone') },
                { value: 'xp', label: t('advancementXp') },
              ]}
              value={state.advancementMode}
              onValueChange={(value) => patch({ advancementMode: value as CreateFormState['advancementMode'] })}
            />
          </Field>
          <Field label={t('advancementAuthority')} hint={t('advancementEntitlementHint')}>
            <SheetSelect
              options={[
                { value: 'ai_gm', label: t('advancementAiGm') },
                { value: 'gm', label: t('advancementHumanGm') },
              ]}
              value={state.advancementAuthority}
              onValueChange={(value) => patch({ advancementAuthority: value as CreateFormState['advancementAuthority'] })}
            />
          </Field>
        </>
      )}

      {!seedActive && (
        <>
          <Field label={t('roomPassword')}>
            <Input
              value={state.roomPassword}
              onChangeText={(roomPassword) => patch({ roomPassword })}
              placeholder={t('roomPasswordPlaceholder')}
              autoCapitalize="none"
            />
          </Field>
          <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
            <Text variant="small" className="flex-1 pr-2">{t('roomOpen')}</Text>
            <Switch checked={state.openRoom} onCheckedChange={(openRoom) => patch({ openRoom })} />
          </View>
        </>
      )}

      {/* 场景图：默认取世界/规则引用预览，可上传自定义 */}
      <Field label={t('sceneImageTitle')} hint={t('sceneImageHint')}>
        <View className="overflow-hidden rounded-lg border border-border">
          <SceneCover source={previewSource} className="h-36 w-full" accessibilityLabel={t('sceneImageTitle')} />
        </View>
        <Text variant="small" className="text-muted-foreground">
          {state.sceneImage ? t('sceneImageCustomBadge') : t('sceneImageDefaultBadge')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={uploading !== null}
            onPress={() => runUpload('scene')}
          >
            {uploading === 'scene' ? <ActivityIndicator size="small" /> : <Icon as={ImagePlus} size={15} />}
            <Text>{t('sceneImageUpload')}</Text>
          </Button>
          {state.sceneImage ? (
            <Button size="sm" variant="ghost" onPress={() => patch({ sceneImage: undefined })}>
              <Icon as={RefreshCw} size={15} />
              <Text>{t('sceneImageUseDefault')}</Text>
            </Button>
          ) : null}
        </View>
      </Field>

      {/* 地图背景折叠在「高级设置」里（对齐 Web details 区块） */}
      {!seedActive && (
        <View className="gap-2">
          <Pressable
            onPress={() => setMapAdvanced(!mapAdvanced)}
            className="flex-row items-center gap-1 self-start rounded-md py-1 active:opacity-60"
            accessibilityRole="button"
          >
            <Text variant="small" className="text-muted-foreground underline">{t('mapBackgroundAdvanced')}</Text>
            <Icon as={mapAdvanced ? ChevronUp : ChevronDown} size={13} className="text-muted-foreground" />
          </Pressable>
          {mapAdvanced && (
            <Field label={t('mapBackgroundTitle')} hint={t('mapBackgroundHint')}>
              <SheetSelect
                options={[
                  { value: 'auto', label: t('mapBackgroundAuto') },
                  { value: 'none', label: t('mapBackgroundNone') },
                  ...BUILTIN_MAP_BACKGROUNDS.map((id) => ({
                    value: `builtin:${id}`,
                    // 上游扁平 key 带连字符，需按字面量取
                    label: t(`mapBackground_${id}` as Parameters<typeof t>[0]),
                  })),
                ]}
                value={mapValue}
                onValueChange={(value) => patch({ mapBackground: mapBackgroundOf(value) })}
                placeholder={t('mapBackgroundTitle')}
              />
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={uploading !== null} onPress={() => runUpload('map')}>
                  {uploading === 'map' ? <ActivityIndicator size="small" /> : <Icon as={ImagePlus} size={15} />}
                  <Text>{t('mapBackgroundUpload')}</Text>
                </Button>
                {mapCustomUploaded ? (
                  <Button size="sm" variant="ghost" onPress={() => patch({ mapBackground: { kind: 'auto' } })}>
                    <Text>{t('mapBackgroundAuto')}</Text>
                  </Button>
                ) : null}
              </View>
              {mapCustomUploaded ? (
                <Text variant="small" className="text-muted-foreground">{t('sceneImageCustomBadge')}</Text>
              ) : null}
            </Field>
          )}
        </View>
      )}

      {uploadError ? <Text variant="small" className="text-destructive">{uploadError}</Text> : null}
    </View>
  )
}
