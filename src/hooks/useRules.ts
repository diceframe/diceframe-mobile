import { useState, useEffect } from 'react';
import { Rule } from '@/types';

export const useRules = () => {
  const [rules, setRules] = useState<Rule[]>([]);

  useEffect(() => {
    // 模拟获取规则列表
    const mockRules: Rule[] = [
      { 
        id: '1', 
        name: '基础规则', 
        content: '这是默认的游戏规则', 
        isEnabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
      },
    ];
    setRules(mockRules);
  }, []);

  const addRule = async (data: { name: string; content: string; isEnabled: boolean; isDefault: boolean }) => {
    const newRule: Rule = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRules(prev => [...prev, newRule]);
  };

  const updateRule = async (id: string, data: { name: string; content: string; isEnabled: boolean; isDefault: boolean }) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r));
  };

  const deleteRule = async (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleRule = async (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, isEnabled: !r.isEnabled, updatedAt: new Date().toISOString() } : r));
  };

  return { rules, addRule, updateRule, deleteRule, toggleRule };
};
