import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { MapPin, Navigation } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import type { MapData, MapLocation } from '@/api/types'

/** 小地图（只读，对齐 Web MapGraph 的 v1 子集：当前位置 + 相邻地点） */
export function MiniMap({ data }: { data?: MapData | null }) {
  const locations = data?.locations ?? []
  const currentId = data?.current_location_id

  if (locations.length === 0) {
    return (
      <Text variant="muted" className="text-center">
        暂无地图数据
      </Text>
    )
  }

  const current = locations.find((l) => l.id === currentId) ?? locations[0]
  const connectedIds = new Set(current?.connected_to ?? [])
  const connected = locations.filter((l) => l.id && connectedIds.has(l.id))

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-8">
      {/* 当前位置 */}
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Navigation size={16} className="text-primary" />
          <Text variant="small" className="font-semibold text-muted-foreground">
            当前位置
          </Text>
        </View>
        <View className="rounded-md border border-primary bg-muted px-3 py-3">
          <Text className="text-base font-semibold">{current.name}</Text>
          {current.content ? (
            <Text variant="small" numberOfLines={3} className="mt-1">
              {current.content}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 相邻地点 */}
      {connected.length > 0 && (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <MapPin size={16} className="text-muted-foreground" />
            <Text variant="small" className="font-semibold text-muted-foreground">
              可达地点
            </Text>
          </View>
          <View className="gap-2">
            {connected.map((loc) => (
              <LocationCard key={loc.id} location={loc} />
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  )
}

function LocationCard({ location }: { location: MapLocation }) {
  return (
    <View className="rounded-md border border-border bg-muted px-3 py-2">
      <Text className="text-sm font-medium">{location.name}</Text>
      {location.content ? (
        <Text variant="small" numberOfLines={2}>
          {location.content}
        </Text>
      ) : null}
      {location.keywords && location.keywords.length > 0 && (
        <Text variant="small" numberOfLines={1} className="mt-0.5">
          {location.keywords.join(' · ')}
        </Text>
      )}
    </View>
  )
}
