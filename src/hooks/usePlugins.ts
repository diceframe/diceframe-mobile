import { useState, useEffect } from 'react';
import { Plugin } from '@/types';

export const usePlugins = () => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);

  useEffect(() => {
    // 模拟获取插件列表
    const mockPlugins: Plugin[] = [
      { 
        id: '1', 
        name: 'Dice Roller', 
        description: '掷骰子插件，支持各种骰子类型', 
        version: '1.0.0',
        author: 'System',
        isInstalled: true,
        isEnabled: true
      },
      { 
        id: '2', 
        name: 'Combat Tracker', 
        description: '战斗管理插件', 
        version: '1.2.0',
        author: 'Community',
        isInstalled: false,
        isEnabled: false
      },
    ];
    setPlugins(mockPlugins);
  }, []);

  const installPlugin = async (pluginId: string) => {
    setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, isInstalled: true } : p));
  };

  const uninstallPlugin = async (pluginId: string) => {
    setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, isInstalled: false, isEnabled: false } : p));
  };

  const togglePlugin = async (pluginId: string) => {
    setPlugins(prev => prev.map(p => p.id === pluginId && p.isInstalled ? { ...p, isEnabled: !p.isEnabled } : p));
  };

  const searchPlugins = async (query: string) => {
    // 模拟搜索插件，这里不修改状态，由页面处理筛选
  };

  return { plugins, installPlugin, uninstallPlugin, togglePlugin, searchPlugins };
};
