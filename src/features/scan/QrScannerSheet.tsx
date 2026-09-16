import * as React from 'react'
import { Modal, Pressable, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { X } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { useThemeToken } from '@/lib/theme'

/**
 * 全屏二维码取景器。
 *
 * 只认二维码（barcodeTypes 限死 'qr'）：条形码、DataMatrix 在本产品里没有语义，
 * 放开只会让误扫多一条路径。
 *
 * 扫到即回调并自锁（scannedRef）：CameraView 在同一张码上会持续回调，不自锁会
 * 把同一个一次性配对码兑换多次——第二次必然 401，反而把成功的那次盖成错误。
 */
export function QrScannerSheet({
  visible,
  title,
  hint,
  onScanned,
  onClose,
}: {
  visible: boolean
  title: string
  hint: string
  onScanned: (value: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [permission, requestPermission] = useCameraPermissions()
  const scannedRef = React.useRef(false)
  const gold = useThemeToken('gold')

  React.useEffect(() => {
    // 每次重新打开都解锁，否则第二次扫码会被上一次的自锁挡住
    if (visible) scannedRef.current = false
  }, [visible])

  React.useEffect(() => {
    // 首次打开直接弹系统权限框：让用户先点一次「允许使用相机」再弹，等于白白多一步。
    // 已被永久拒绝（canAskAgain=false）时不再请求，改为提示去系统设置。
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission()
    }
  }, [visible, permission, requestPermission])

  function handleScan(result: { data: string }) {
    if (scannedRef.current) return
    scannedRef.current = true
    onScanned(result.data)
  }

  const granted = permission?.granted === true

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        {granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-white">
              {permission?.canAskAgain === false ? t('dfScanPermissionBlocked') : t('dfScanPermissionHint')}
            </Text>
            {permission?.canAskAgain === false ? null : (
              <Button onPress={() => void requestPermission()}>
                <Text>{t('dfScanGrantPermission')}</Text>
              </Button>
            )}
          </View>
        )}

        {/* 取景框与文案叠在预览之上；不拦触摸，关闭按钮除外 */}
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          {granted ? (
            <View
              className="h-64 w-64 rounded-2xl"
              style={{ borderWidth: 2, borderColor: gold }}
            />
          ) : null}
        </View>
        <View className="absolute inset-x-0 bottom-0 gap-2 px-8 pb-16" pointerEvents="none">
          <Text className="text-center text-lg font-semibold text-white">{title}</Text>
          <Text className="text-center text-white/70">{hint}</Text>
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
          hitSlop={12}
          className="absolute right-5 top-14 h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-70"
        >
          <X size={22} color="#ffffff" />
        </Pressable>
      </View>
    </Modal>
  )
}
