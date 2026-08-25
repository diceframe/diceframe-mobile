import { useState, useEffect } from 'react';
import { LogEntry } from '@/types';

export const useLogs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // 模拟获取日志列表
    const mockLogs: LogEntry[] = [
      { 
        id: '1', 
        level: 'INFO', 
        message: '用户登录成功', 
        module: 'Auth',
        timestamp: new Date().toISOString() 
      },
      { 
        id: '2', 
        level: 'WARN', 
        message: 'API响应慢', 
        module: 'API',
        data: { responseTime: 1500 },
        timestamp: new Date().toISOString() 
      },
    ];
    setLogs(mockLogs);
  }, []);

  const clearLogs = async () => {
    setLogs([]);
  };

  const exportLogs = async () => {
    // 模拟导出日志
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refreshLogs = async () => {
    // 模拟刷新日志
    const mockLogs: LogEntry[] = [
      { 
        id: Date.now().toString(), 
        level: 'INFO', 
        message: '日志已刷新', 
        module: 'System',
        timestamp: new Date().toISOString() 
      },
      ...logs,
    ];
    setLogs(mockLogs);
  };

  return { logs, clearLogs, exportLogs, refreshLogs };
};
