import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Switch } from 'react-native';
import { usePlugins } from '@/hooks/usePlugins';
import { useState } from 'react';
import { Plugin } from '@/types';

export default function PluginsScreen() {
  const { plugins, installPlugin, uninstallPlugin, togglePlugin, searchPlugins } = usePlugins();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'installed' | 'store'>('installed');

  const filteredPlugins = plugins.filter(plugin => 
    plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plugin.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const installedPlugins = filteredPlugins.filter(plugin => plugin.isInstalled);
  const storePlugins = filteredPlugins.filter(plugin => !plugin.isInstalled);

  const handleInstall = async (pluginId: string) => {
    await installPlugin(pluginId);
  };

  const handleUninstall = async (pluginId: string) => {
    await uninstallPlugin(pluginId);
  };

  const handleToggle = async (pluginId: string) => {
    await togglePlugin(pluginId);
  };

  const renderPluginItem = ({ item }: { item: Plugin }) => (
    <View style={styles.pluginItem}>
      <View style={styles.pluginHeader}>
        <Text style={styles.pluginName}>{item.name}</Text>
        <Text style={styles.pluginVersion}>v{item.version}</Text>
      </View>
      {item.author && <Text style={styles.pluginAuthor}>开发者：{item.author}</Text>}
      {item.description && <Text style={styles.pluginDesc}>{item.description}</Text>}
      <View style={styles.pluginActions}>
        {item.isInstalled ? (
          <>
            <View style={styles.toggleSection}>
              <Text style={styles.toggleLabel}>启用：</Text>
              <Switch
                value={item.isEnabled}
                onValueChange={() => handleToggle(item.id)}
                trackColor={{ false: '#ddd', true: '#007AFF' }}
              />
            </View>
            <TouchableOpacity style={styles.uninstallButton} onPress={() => handleUninstall(item.id)}>
              <Text style={styles.buttonText}>卸载</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.installButton} onPress={() => handleInstall(item.id)}>
            <Text style={styles.buttonText}>安装</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>插件市场</Text>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'installed' && styles.activeTab]}
          onPress={() => setActiveTab('installed')}
        >
          <Text style={[styles.tabText, activeTab === 'installed' && styles.activeTabText]}>
            已安装 ({installedPlugins.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'store' && styles.activeTab]}
          onPress={() => setActiveTab('store')}
        >
          <Text style={[styles.tabText, activeTab === 'store' && styles.activeTabText]}>
            插件商店 ({storePlugins.length})
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="搜索插件..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <FlatList
        data={activeTab === 'installed' ? installedPlugins : storePlugins}
        keyExtractor={(item) => item.id}
        renderItem={renderPluginItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeTab === 'installed' ? '暂无已安装插件' : '暂无可用插件'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  tabBar: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  pluginItem: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  pluginHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pluginName: {
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
  },
  pluginVersion: {
    fontSize: 14,
    color: '#666',
  },
  pluginAuthor: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  pluginDesc: {
    fontSize: 14,
    color: '#333',
    marginBottom: 12,
    lineHeight: 20,
  },
  pluginActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#666',
  },
  installButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  uninstallButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 16,
    color: '#666',
  },
});
