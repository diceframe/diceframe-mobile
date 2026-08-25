import { useState, useEffect } from 'react';
import { Peer } from '@/types';

export const usePeer = () => {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  useEffect(() => {
    // 模拟获取P2P设备列表
    const mockPeers: Peer[] = [
      { id: '1', name: 'User的iPhone', connected: false, lastSeen: new Date().toISOString() },
      { id: '2', name: 'User的iPad', connected: false, lastSeen: new Date().toISOString() },
    ];
    setPeers(mockPeers);
  }, []);

  const connect = async (peerId: string) => {
    setStatus('connecting');
    // 模拟连接请求
    await new Promise(resolve => setTimeout(resolve, 1000));
    setPeers(prev => prev.map(p => p.id === peerId ? { ...p, connected: true } : p));
    setStatus('connected');
  };

  const disconnect = async (peerId: string) => {
    setPeers(prev => prev.map(p => p.id === peerId ? { ...p, connected: false } : p));
    setStatus('disconnected');
  };

  return { peers, status, connect, disconnect };
};
