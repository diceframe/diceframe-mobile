import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import type { TKey } from '@/i18n/keyset'
import { useT } from '@/i18n/t'
import type { LocalItemBadge } from '@/lib/local-library/sync-status'

const BADGE_KEYS: Record<LocalItemBadge, TKey> = {
  'unpushed': 'dfLocalBadgeUnpushed',
  'server-deleted': 'dfLocalBadgeServerDeleted',
  'locked': 'dfLocalBadgeLocked',
}

/** 本机列表项的状态标记：只读、未推送改动、服务器已删除、服务器锁定（锁定已含只读，不重复显示） */
export function LocalItemBadges({ readOnly, badges }: { readOnly: boolean; badges: readonly LocalItemBadge[] }) {
  const t = useT()
  const showReadOnly = readOnly && !badges.includes('locked')
  if (!showReadOnly && !badges.length) return null
  return (
    <>
      {showReadOnly ? <Badge variant="secondary" className="px-1.5 py-0"><Text className="text-[10px]">{t('dfLocalCardReadOnly')}</Text></Badge> : null}
      {badges.map((badge) => (
        <Badge key={badge} variant={badge === 'server-deleted' ? 'destructive' : 'outline'} className="px-1.5 py-0">
          <Text className="text-[10px]">{t(BADGE_KEYS[badge])}</Text>
        </Badge>
      ))}
    </>
  )
}
