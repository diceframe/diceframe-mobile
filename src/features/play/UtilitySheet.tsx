import { View } from 'react-native'
import { HelpCircle, Image as ImageIcon, Sparkles } from 'lucide-react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'

interface UtilitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isGm: boolean
  onOpenRuleHelp: () => void
  onOpenSceneGallery: () => void
  /** DF Agent 只对房主开放；不传则不显示入口 */
  onOpenAssistant?: () => void
}

/** 低频页面工具：与情境行重复的入口（角色/感知/桌面管理）不在这里重复出现 */
export function UtilitySheet({ open, onOpenChange, isGm, onOpenRuleHelp, onOpenSceneGallery, onOpenAssistant }: UtilitySheetProps) {
  const t = useT()

  return (
    <Sheet open={open} onClose={() => onOpenChange(false)} className="h-auto">
      <View className="gap-2 pt-1">
        <Text variant="h4">{t('dfPlayMoreActions')}</Text>
        <Button
          variant="outline"
          onPress={() => {
            onOpenChange(false)
            onOpenRuleHelp()
          }}
        >
          <Icon as={HelpCircle} size={17} />
          <Text>{t('ruleHelp')}</Text>
        </Button>
        {isGm && (
          <Button
            variant="outline"
            onPress={() => {
              onOpenChange(false)
              onOpenSceneGallery()
            }}
          >
            <Icon as={ImageIcon} size={17} />
            <Text>{t('sceneGallery')}</Text>
          </Button>
        )}
        {onOpenAssistant ? (
          <Button
            variant="outline"
            onPress={() => {
              onOpenChange(false)
              onOpenAssistant()
            }}
          >
            <Icon as={Sparkles} size={17} />
            <Text>{t('dfAgentEntry')}</Text>
          </Button>
        ) : null}
      </View>
    </Sheet>
  )
}
