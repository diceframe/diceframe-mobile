import * as React from 'react'
import { Share, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Copy, Share2, X } from 'lucide-react-native'

import { QrCode } from '@/components/patterns/qr-code'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'

/**
 * 邀请 / 接管链接的二维码卡片（在 GM 面板里就地展开，不再叠一层面板）：手机玩家用 App 的
 * 「扫码加入」直接扫；也可复制链接或走系统分享发出去。
 */
export function ShareQrCard({ link, hint, onClose }: { link: string; hint: string; onClose: () => void }) {
  const t = useT()
  const [copied, setCopied] = React.useState(false)

  return (
    <View className="items-center gap-2.5 rounded-lg border border-border bg-card p-3">
      <View className="w-full flex-row items-center justify-between">
        <Text className="font-semibold">{t('dfQrTitle')}</Text>
        <Button variant="ghost" size="icon" onPress={onClose} accessibilityLabel={t('dfQrHide')}>
          <Icon as={X} size={16} />
        </Button>
      </View>
      <View className="rounded-md bg-white p-1">
        <QrCode value={link} size={220} />
      </View>
      <Text variant="small" className="text-center text-muted-foreground">{hint}</Text>
      <Text variant="small" selectable numberOfLines={2} className="text-center font-mono text-muted-foreground">
        {link}
      </Text>
      <View className="w-full flex-row gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onPress={() => {
            Clipboard.setString(link)
            setCopied(true)
          }}
        >
          <Icon as={Copy} size={14} />
          <Text>{copied ? t('dfQrCopied') : t('dfQrCopy')}</Text>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onPress={() => void Share.share({ message: link }).catch(() => undefined)}
        >
          <Icon as={Share2} size={14} />
          <Text>{t('dfQrShare')}</Text>
        </Button>
      </View>
    </View>
  )
}
