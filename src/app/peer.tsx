import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { usePeer } from '@/hooks/usePeer';
import { useState } from 'react';

export default function PeerConnectScreen() {
  const { peers, connect, disconnect, status } = usePeer();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (peerId: string) => {
    setConnecting(peerId);
    try {
      await connect(peerId);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>P2P 连接</Text>
      <Text style={styles.status}>连接状态: {status}</Text>
      
      <FlatList
        data={peers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.peerItem}>
            <View style={styles.peerInfo}>
              <Text style={styles.peerName}>{item.name}</Text>
              <Text style={styles.peerId}>ID: {item.id}</Text>
              <Text style={styles.peerStatus}>
                状态: {item.connected ? '已连接' : '未连接'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.connectButton,
                item.connected && styles.disconnectButton,
                connecting === item.id && styles.disabledButton,
              ]}
              onPress={() => item.connected ? disconnect(item.id) : handleConnect(item.id)}
              disabled={connecting === item.id}
            >
              <Text style={styles.buttonText}>
                {connecting === item.id ? '连接中...' : item.connected ? '断开' : '连接'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无可用设备</Text>}
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
    marginBottom: 16,
  },
  status: {
    fontSize: 16,
    marginBottom: 24,
    color: '#666',
  },
  peerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  peerInfo: {
    flex: 1,
  },
  peerName: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  peerId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  peerStatus: {
    fontSize: 14,
    color: '#333',
  },
  connectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  disconnectButton: {
    backgroundColor: '#FF3B30',
  },
  disabledButton: {
    backgroundColor: '#999',
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
