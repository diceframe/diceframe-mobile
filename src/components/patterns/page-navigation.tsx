import * as React from 'react'
import { FlatList, Keyboard, Pressable, View } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { parsePageNumber } from '@/lib/pagination'

interface PageNavigationProps {
  page: number
  pages: number
  disabled?: boolean
  onPageChange: (page: number) => void
}

/** 当前页码即选择入口；长列表在抽屉中按页码定位，不额外占用正文高度。 */
export function PageNavigation({ page, pages, disabled = false, onPageChange }: PageNavigationProps) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const target = parsePageNumber(query, pages)
  const choices = query.trim() ? (target === null ? [] : [target]) : Array.from({ length: pages }, (_, i) => i + 1)

  function close() {
    Keyboard.dismiss()
    setOpen(false)
    setQuery('')
  }

  function goTo(next: number) {
    if (disabled) return
    close()
    if (next !== page) onPageChange(next)
  }

  return (
    <>
      <View className="flex-row items-center justify-between gap-2 border-t border-border py-3">
        <Button size="sm" variant="outline" disabled={disabled || page <= 1} onPress={() => goTo(page - 1)}>
          <Text>{t('previousPage')}</Text>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          disabled={disabled}
          accessibilityLabel={t('pageOf', { page, total: pages })}
          accessibilityHint={t('dfPaginationChoose')}
          onPress={() => setOpen(true)}
        >
          <Text>{t('pageOf', { page, total: pages })}</Text>
          <Icon as={ChevronDown} size={14} />
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || page >= pages} onPress={() => goTo(page + 1)}>
          <Text>{t('nextPage')}</Text>
        </Button>
      </View>
      <Sheet open={open} onClose={close} className="h-[70%]" scrollable={false}>
        <View className="min-h-0 flex-1 gap-3">
          <Text variant="h3">{t('dfPaginationChoose')}</Text>
          <Input
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { if (target !== null) goTo(target) }}
            accessibilityLabel={t('dfPaginationPage')}
            placeholder={t('dfPaginationRange', { total: pages })}
            keyboardType="number-pad"
            returnKeyType="go"
            editable={!disabled}
          />
          <FlatList
            data={choices}
            keyExtractor={(item) => String(item)}
            className="min-h-0 flex-1"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item === page, disabled }}
                disabled={disabled}
                onPress={() => goTo(item)}
                className="min-h-12 flex-row items-center justify-between rounded-md px-3 py-3 active:bg-accent"
              >
                <Text className={item === page ? 'font-semibold text-primary' : ''}>
                  {t('pageOf', { page: item, total: pages })}
                </Text>
                {item === page ? <Icon as={Check} size={18} className="text-primary" /> : null}
              </Pressable>
            )}
            ListEmptyComponent={(
              <Text accessibilityLiveRegion="polite" className="text-sm text-destructive">
                {t('dfPaginationRange', { total: pages })}
              </Text>
            )}
          />
          <Button variant="ghost" onPress={close}><Text>{t('cancel')}</Text></Button>
        </View>
      </Sheet>
    </>
  )
}
