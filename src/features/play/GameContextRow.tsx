import { ScrollView, View } from 'react-native'
import { Mail, Map, Menu, Route, User, WalletCards } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'

interface GameContextRowProps {
  isWideTablet: boolean
  /** 窄屏抽屉的开合与选中情境：高亮只在抽屉打开期间跟随入口 */
  sidebarOpen: boolean
  sidebarTab: 'plot' | 'map'
  onOpenCharacter: () => void
  onOpenStoryTool: (tab: 'plot' | 'map') => void
  /** 待处理经济提案：>0 且当前没有弹窗时展示「稍后」恢复入口 */
  showPendingPayments: boolean
  pendingPaymentsCount: number
  onShowPendingPayments: () => void
  privateMessagesCount: number
  onOpenPrivateMessages: () => void
  isGm: boolean
  onOpenGmPanel: () => void
}

/** 情境入口行：只放当前游玩中会频繁切换的内容。 */
export function GameContextRow({
  isWideTablet,
  sidebarOpen,
  sidebarTab,
  onOpenCharacter,
  onOpenStoryTool,
  showPendingPayments,
  pendingPaymentsCount,
  onShowPendingPayments,
  privateMessagesCount,
  onOpenPrivateMessages,
  isGm,
  onOpenGmPanel,
}: GameContextRowProps) {
  const t = useT()

  return (
    <ScrollView
      horizontal
      className="max-h-11 border-b border-border"
      contentContainerClassName="items-center gap-1 px-3 py-1"
      showsHorizontalScrollIndicator={false}
    >
      <Button size="sm" variant="ghost" onPress={onOpenCharacter}>
        <Icon as={User} size={16} />
        <Text>{t('dfPlayTabCharacter')}</Text>
      </Button>
      {!isWideTablet && (
        <>
          <Button
            size="sm"
            variant={sidebarOpen && sidebarTab === 'plot' ? 'secondary' : 'ghost'}
            onPress={() => onOpenStoryTool('plot')}
          >
            <Icon as={Route} size={16} />
            <Text>{t('dfPlayTabPlot')}</Text>
          </Button>
          <Button
            size="sm"
            variant={sidebarOpen && sidebarTab === 'map' ? 'secondary' : 'ghost'}
            onPress={() => onOpenStoryTool('map')}
          >
            <Icon as={Map} size={16} />
            <Text>{t('dfPlayTabMap')}</Text>
          </Button>
        </>
      )}
      {showPendingPayments && (
        <Button size="sm" variant="secondary" onPress={onShowPendingPayments}>
          <Icon as={WalletCards} size={16} />
          <Text>{t('economyPendingAction', { count: pendingPaymentsCount })}</Text>
        </Button>
      )}
      {privateMessagesCount > 0 && (
        <Button size="sm" variant="ghost" onPress={onOpenPrivateMessages}>
          <View>
            <Icon as={Mail} size={16} />
            <View className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive" />
          </View>
          <Text>{t('dfPlayTabPerception', { count: privateMessagesCount })}</Text>
        </Button>
      )}
      {isGm && (
        <Button size="sm" variant="ghost" onPress={onOpenGmPanel}>
          <Icon as={Menu} size={16} />
          <Text>{t('dfPlayTabGmPanel')}</Text>
        </Button>
      )}
    </ScrollView>
  )
}
