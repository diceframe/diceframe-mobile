import { Pressable, ScrollView, View } from 'react-native'
import {
  BookOpenText,
  Brain,
  ChevronRight,
  CircleUserRound,
  FileText,
  Gavel,
  Globe2,
  PackageOpen,
  Palette,
  RefreshCw,
  Server,
  Vibrate,
  Volume2,
} from 'lucide-react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'

import { PageHeader } from '@/components/page-header'
import { Screen } from '@/components/screen'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { SettingsSection } from '@/app/(profile)/settings'
import { strings } from '@/lib/strings'
import { useSettingsStore } from '@/stores/settings'

interface MenuRowProps {
  icon: typeof Server
  label: string
  detail?: string
  onPress: () => void
}

function MenuRow({ icon, label, detail, onPress }: MenuRowProps) {
  return (
    <Pressable
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-accent"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}，${detail}` : label}
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted">
        <Icon as={icon} size={17} />
      </View>
      <Text className="flex-1 font-medium">{label}</Text>
      {detail ? <Text variant="small" className="max-w-[42%] text-right" numberOfLines={1}>{detail}</Text> : null}
      <Icon as={ChevronRight} size={17} className="text-muted-foreground" />
    </Pressable>
  )
}

function MenuGroup({ children }: { children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children : [children]
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="px-0 py-0">
        {rows.map((row, index) => (
          <View key={index}>{index > 0 ? <Separator className="ml-16" /> : null}{row}</View>
        ))}
      </CardContent>
    </Card>
  )
}

const THEME_LABEL = { system: '跟随系统', light: '浅色', dark: '深色' } as const

export default function ProfileScreen() {
  const router = useRouter()
  const settings = useSettingsStore()
  const identity = settings.token ? 'GM 已登录' : settings.share ? settings.share.name || '玩家已加入' : '未登录'

  const openSetting = (section: SettingsSection) => {
    router.push({ pathname: '/settings', params: { section } })
  }

  return (
    <Screen className="px-4" style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <PageHeader title="我的" subtitle="身份、偏好与冒险工具" className="px-0" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-8">
        {/* 身份摘要卡：点击直达「身份与登录」，通用偏好仍走下方设置组，避免重复入口 */}
        <Pressable
          className="flex-row items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 active:bg-accent"
          onPress={() => openSetting('identity')}
          accessibilityRole="button"
          accessibilityLabel="冒险者档案，查看身份与登录"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <Icon as={CircleUserRound} size={27} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="h3" className="border-b-0 pb-0" numberOfLines={1}>冒险者档案</Text>
            <Text variant="small" numberOfLines={1}>{identity} · {settings.baseUrl || '尚未连接服务器'}</Text>
          </View>
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </Pressable>

        <View className="gap-2">
          <Text variant="small" className="px-1 font-semibold text-foreground">设置</Text>
          <MenuGroup>
            <MenuRow icon={Server} label="服务器" detail={settings.baseUrl ? settings.baseUrl.replace(/^https?:\/\//, '') : '未连接'} onPress={() => openSetting('server')} />
            <MenuRow icon={CircleUserRound} label="身份与登录" detail={identity} onPress={() => openSetting('identity')} />
            <MenuRow icon={Palette} label="外观" detail={THEME_LABEL[settings.themeMode]} onPress={() => openSetting('appearance')} />
            <MenuRow icon={Volume2} label="朗读" detail={`${settings.ttsRate.toFixed(2)}x`} onPress={() => openSetting('speech')} />
            <MenuRow icon={Vibrate} label="触觉反馈" detail={settings.hapticsEnabled ? '已开启' : '已关闭'} onPress={() => openSetting('haptics')} />
            <MenuRow icon={RefreshCw} label={strings.updates.title} detail={`v${Constants.expoConfig?.version ?? '-'}`} onPress={() => openSetting('updates')} />
          </MenuGroup>
        </View>

        {/* 冒险工具与法律信息共用一张卡片，压缩页面层级；版本号作页面脚注 */}
        <View className="gap-2">
          <Text variant="small" className="px-1 font-semibold text-foreground">冒险工具</Text>
          <MenuGroup>
            <MenuRow icon={Globe2} label="世界图鉴" onPress={() => router.push('/worlds')} />
            <MenuRow icon={PackageOpen} label="插件与内容包" onPress={() => router.push('/plugins')} />
            <MenuRow icon={Brain} label="叙事记忆" onPress={() => router.push('/memory')} />
            <MenuRow icon={BookOpenText} label="对局记录" onPress={() => router.push('/logs')} />
            <MenuRow icon={Gavel} label="规则库" onPress={() => router.push('/rules')} />
            <MenuRow icon={FileText} label="法律与隐私" onPress={() => router.push('/legal')} />
          </MenuGroup>
        </View>

        <Text variant="small" className="text-center text-muted-foreground">
          DiceFrame 移动端 v{Constants.expoConfig?.version ?? '-'}
        </Text>
      </ScrollView>
    </Screen>
  )
}
