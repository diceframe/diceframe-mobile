import * as React from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { Search, Star } from 'lucide-react-native'

import type { MapData, MapLocation } from '@/api/types'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { strings } from '@/lib/strings'
import { MapGraph } from './MapGraph'
import { useAssetUri } from './useAssetUri'
import { mapAssetSource } from '@/api/assets'

export interface MapWorkspaceProps {
  map?: MapData | null
  currentScene?: string
}

function locationId(location: MapLocation): string {
  return String(location.id ?? location.name ?? '')
}

function sourceLabel(location: MapLocation): string {
  return location.source === 'plugin'
    ? location.plugin_name || strings.map.sourcePlugin
    : strings.map.sourceLorebook
}

/**
 * 地图工作台内容：力导向图、节点选择、搜索和地点详情处于同一面板。
 * 搜索时详情区临时显示结果列表，选中地点后立即回到详情。
 */
export function MapWorkspace({ map, currentScene }: MapWorkspaceProps) {
  const locations = React.useMemo(() => map?.locations ?? [], [map])

  const [query, setQuery] = React.useState('')
  // 选中地点按地图身份键控：打开/地图变化时默认选中当前地点，
  // 之后保留用户选择（对齐 Web watch current_location_id/locations.length 的重选逻辑）
  const [selection, setSelection] = React.useState<{ key: string; id: string } | null>(null)
  const mapIdentity = `${map?.active_map?.id || ''}:${map?.current_location_id || ''}:${locations.length}`
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredLocations = React.useMemo(() => {
    if (!normalizedQuery) return locations
    return locations.filter((location) => {
      const haystack = [
        location.name,
        location.content,
        ...(location.keywords || []),
      ]
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [locations, normalizedQuery])

  const selectedId = selection?.key === mapIdentity ? selection.id : ''
  const selectedLocation =
    locations.find((location) => locationId(location) === selectedId) ??
    // 未选择（含刚打开/地图变化）时默认选中当前地点，否则第一个
    locations.find((location) => locationId(location) === String(map?.current_location_id || '')) ??
    locations[0] ??
    null
  const connectedLocations = React.useMemo(() => {
    const refs = selectedLocation?.connected_to || []
    return refs
      .map((reference) =>
        locations.find(
          (location) =>
            locationId(location) === String(reference) || location.name === String(reference),
        ),
      )
      .filter((location): location is MapLocation => Boolean(location))
  }, [selectedLocation, locations])

  function selectLocation(location: MapLocation) {
    setSelection({ key: mapIdentity, id: locationId(location) })
  }

  return (
    <View className="min-h-0 flex-1 gap-2">
      <View className="min-h-[220px] flex-1">
        <MapGraph
          map={map}
          currentScene={currentScene}
          selectedLocationId={selectedLocation ? locationId(selectedLocation) : ''}
          onSelectLocation={selectLocation}
        />
      </View>

      {/* 搜索 */}
      <View className="relative">
          <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <Icon as={Search} size={16} className="text-muted-foreground" />
          </View>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder={strings.map.searchPlaceholder}
            className="pl-9"
            returnKeyType="search"
          />
        </View>

      {/* 列表 / 详情：搜索时显示过滤列表，否则显示选中地点详情 */}
      {normalizedQuery ? (
          <ScrollView
            className="min-h-0 flex-1"
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-1.5"
          >
            {filteredLocations.map((location) => (
              <Pressable
                key={locationId(location)}
                className="flex-row items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2.5 active:bg-accent"
                accessibilityLabel={location.name}
                onPress={() => {
                  selectLocation(location)
                  setQuery('')
                }}
              >
                {locationId(location) === map?.current_location_id ? (
                  <Icon as={Star} size={14} className="text-primary" />
                ) : (
                  <View className="h-2 w-2 rounded-full bg-primary" />
                )}
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1}>{location.name}</Text>
                  <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                    {sourceLabel(location)}
                  </Text>
                </View>
              </Pressable>
            ))}
            {filteredLocations.length === 0 ? (
              <Text variant="muted" className="py-6 text-center">
                {strings.map.noSearchResults}
              </Text>
            ) : null}
          </ScrollView>
        ) : selectedLocation ? (
          <MapLocationDetail
            location={selectedLocation}
            isCurrent={locationId(selectedLocation) === map?.current_location_id}
            connectedLocations={connectedLocations}
            onSelectConnected={selectLocation}
          />
      ) : null}
    </View>
  )
}

/** 地点详情：图片/来源/当前位置徽标/描述/相连地点/关键词（对齐 Web map-location-detail） */
function MapLocationDetail({
  location,
  isCurrent,
  connectedLocations,
  onSelectConnected,
}: {
  location: MapLocation
  isCurrent: boolean
  connectedLocations: MapLocation[]
  onSelectConnected: (location: MapLocation) => void
}) {
  const imageUri = useAssetUri(mapAssetSource(location.image_url))

  return (
    <ScrollView
      className="min-h-0 flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="gap-2.5 pb-2"
    >
      {imageUri ? (
        <ExpoImage
          source={{ uri: imageUri }}
          className="h-36 w-full rounded-md border border-border"
          contentFit="cover"
          accessibilityLabel={location.name}
        />
      ) : null}

      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="small" className="text-muted-foreground">
            {sourceLabel(location)}
          </Text>
          <Text variant="h4" numberOfLines={2}>
            {location.name}
          </Text>
        </View>
        {isCurrent ? (
          <View className="flex-row items-center gap-1 rounded-full border border-border px-2.5 py-1">
            <Icon as={Star} size={11} className="text-primary" />
            <Text variant="small" className="text-primary">
              {strings.map.currentLocation}
            </Text>
          </View>
        ) : null}
      </View>

      <Text>{location.content || strings.map.noDescription}</Text>

      {connectedLocations.length > 0 ? (
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {strings.map.connections}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {connectedLocations.map((connected) => (
              <Pressable
                key={locationId(connected)}
                className="rounded-full border border-border bg-muted px-3 py-1.5 active:bg-accent"
                accessibilityLabel={connected.name}
                onPress={() => onSelectConnected(connected)}
              >
                <Text variant="small" className="text-primary">
                  {connected.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {location.keywords && location.keywords.length > 0 ? (
        <View className="gap-1.5">
          <Text variant="small" className="font-semibold text-muted-foreground">
            {strings.map.keywords}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {location.keywords.map((keyword) => (
              <View key={keyword} className="rounded-full bg-muted px-3 py-1.5">
                <Text variant="small" className="text-muted-foreground">
                  {keyword}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}
