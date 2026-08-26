import * as React from 'react'

import { errorMessage } from '@/api/client'
import { controlPlugin, fetchInstalledPlugins, fetchMarketplacePlugins, installMarketplacePlugin, uninstallPlugin as uninstallPluginApi } from '@/api/library'
import type { Plugin } from '@/types'

export function usePlugins() {
  const [plugins, setPlugins] = React.useState<Plugin[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [installedResult, marketResult] = await Promise.all([
        fetchInstalledPlugins(),
        fetchMarketplacePlugins().catch(() => ({ plugins: [] })),
      ])
      const installed = installedResult.plugins ?? []
      const installedIds = new Set(installed.map((plugin) => plugin.id))
      setPlugins([
        ...installed.map((plugin) => ({ id: plugin.id, name: plugin.name, description: plugin.description, version: plugin.version || '-', author: '', isInstalled: true, isEnabled: plugin.running })),
        ...(marketResult.plugins ?? []).filter((plugin) => !installedIds.has(plugin.id)).map((plugin) => ({ id: plugin.id, name: plugin.name, description: plugin.description, version: plugin.version || '-', author: typeof plugin.author === 'string' ? plugin.author : '', isInstalled: false, isEnabled: false })),
      ])
      setError('')
    } catch (cause) { setError(errorMessage(cause)) } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { queueMicrotask(() => void load()) }, [load])

  async function installPlugin(pluginId: string) {
    const result = await installMarketplacePlugin(pluginId)
    if (result.ok === false) throw new Error(result.error || '安装插件失败')
    await load()
  }

  async function uninstallPlugin(pluginId: string) {
    const result = await uninstallPluginApi(pluginId)
    if (result.ok === false) throw new Error(result.error || '卸载插件失败')
    await load()
  }

  async function togglePlugin(pluginId: string) {
    const plugin = plugins.find((item) => item.id === pluginId)
    if (!plugin?.isInstalled) return
    const result = await controlPlugin(pluginId, plugin.isEnabled ? 'stop' : 'start')
    if (result.ok === false) throw new Error(result.error || '切换插件状态失败')
    await load()
  }

  return { plugins, loading, error, refresh: load, installPlugin, uninstallPlugin, togglePlugin }
}
