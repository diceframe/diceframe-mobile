import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLogs } from '@/hooks/useLogs';
import { useState } from 'react';
import { LogEntry } from '@/types';

const LOG_LEVELS = ['全部', 'INFO', 'WARN', 'ERROR', 'DEBUG'];

export default function LogsScreen() {
  const { logs, clearLogs, exportLogs, refreshLogs } = useLogs();
  const [selectedLevel, setSelectedLevel] = useState<string>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredLogs = logs.filter(log => {
    const matchesLevel = selectedLevel === '全部' || log.level === selectedLevel;
    const matchesSearch = !searchQuery.trim() || 
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.module?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLogs();
    setIsRefreshing(false);
  };

  const handleExport = async () => {
    await exportLogs();
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'INFO': return '#007AFF';
      case 'WARN': return '#FF9500';
      case 'ERROR': return '#FF3B30';
      case 'DEBUG': return '#8E8E93';
      default: return '#333';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>系统日志</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={isRefreshing}>
            <Text style={styles.buttonText}>{isRefreshing ? '刷新中...' : '刷新'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
            <Text style={styles.buttonText}>导出</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={clearLogs}>
            <Text style={styles.buttonText}>清空</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.levelFilter}>
          <Text style={styles.filterLabel}>日志级别：</Text>
          <View style={styles.levelPicker}>
            <Picker
              selectedValue={selectedLevel}
              onValueChange={setSelectedLevel}
              style={styles.picker}
            >
              {LOG_LEVELS.map(level => (
                <Picker.Item key={level} label={level} value={level} />
              ))}
            </Picker>
          </View>
        </View>
        
        <TextInput
          style={styles.searchInput}
          placeholder="搜索日志内容或模块..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <Text style={styles.resultText}>
        共 {filteredLogs.length} 条日志
      </Text>

      <FlatList
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.logItem}>
            <View style={styles.logHeader}>
              <Text style={[styles.logLevel, { color: getLevelColor(item.level) }]}>
                {item.level}
              </Text>
              <Text style={styles.logTime}>
                {new Date(item.timestamp).toLocaleString()}
              </Text>
            </View>
            {item.module && <Text style={styles.logModule}>模块：{item.module}</Text>}
            <Text style={styles.logMessage}>{item.message}</Text>
            {item.data && (
              <Text style={styles.logData} numberOfLines={2}>
                {JSON.stringify(item.data)}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无日志</Text>}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  exportButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#34C759',
    borderRadius: 6,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 14,
  },
  filterSection: {
    marginBottom: 16,
  },
  levelFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  levelPicker: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  picker: {
    height: 40,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  resultText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  logItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logLevel: {
    fontSize: 14,
    fontWeight: '600',
  },
  logTime: {
    fontSize: 12,
    color: '#666',
  },
  logModule: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  logMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  logData: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 16,
    color: '#666',
  },
});
