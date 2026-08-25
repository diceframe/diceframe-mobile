import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal } from 'react-native';
import { useMemory } from '@/hooks/useMemory';
import { useState } from 'react';
import { MemoryItem } from '@/types';

export default function MemoryScreen() {
  const { memories, addMemory, deleteMemory, searchMemories, refreshMemories } = useMemory();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ content: '', weight: 1 });
  const [isSearching, setIsSearching] = useState(false);

  const handleSave = async () => {
    if (!formData.content.trim()) return;
    
    await addMemory(formData);
    setShowAddModal(false);
    setFormData({ content: '', weight: 1 });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    await searchMemories(searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    refreshMemories();
  };

  const displayedMemories = isSearching ? memories : memories;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>向量记忆</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.buttonText}>添加记忆</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索记忆内容..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <View style={styles.searchButtons}>
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Text style={styles.buttonText}>搜索</Text>
          </TouchableOpacity>
          {isSearching && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClearSearch}>
              <Text style={styles.buttonText}>清除</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching && (
        <Text style={styles.searchResultText}>
          搜索结果：找到 {displayedMemories.length} 条相关记忆
        </Text>
      )}

      <FlatList
        data={displayedMemories}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.memoryItem}>
            <View style={styles.memoryHeader}>
              <Text style={styles.memoryWeight}>权重：{item.weight}</Text>
              {item.similarity && (
                <Text style={styles.similarity}>相似度：{(item.similarity * 100).toFixed(1)}%</Text>
              )}
            </View>
            <Text style={styles.memoryContent}>{item.content}</Text>
            <View style={styles.memoryActions}>
              <Text style={styles.memoryTime}>
                创建时间：{new Date(item.createdAt).toLocaleString()}
              </Text>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteMemory(item.id)}>
                <Text style={styles.actionText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {isSearching ? '未找到匹配的记忆' : '暂无记忆'}
          </Text>
        }
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>添加记忆</Text>
            
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="记忆内容"
              value={formData.content}
              onChangeText={(text) => setFormData({ ...formData, content: text })}
              multiline
              numberOfLines={6}
            />
            
            <View style={styles.weightSection}>
              <Text style={styles.weightLabel}>记忆权重：</Text>
              <View style={styles.weightPicker}>
                {[1, 2, 3, 4, 5].map(weight => (
                  <TouchableOpacity
                    key={weight}
                    style={[
                      styles.weightOption,
                      formData.weight === weight && styles.selectedWeight
                    ]}
                    onPress={() => setFormData({ ...formData, weight })}
                  >
                    <Text style={[
                      styles.weightText,
                      formData.weight === weight && styles.selectedWeightText
                    ]}>
                      {weight}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddModal(false);
                setFormData({ content: '', weight: 1 });
              }}>
                <Text style={styles.buttonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.buttonText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '500',
  },
  searchSection: {
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
  },
  searchButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  searchButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#999',
    borderRadius: 6,
  },
  searchResultText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  memoryItem: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoryWeight: {
    fontSize: 14,
    color: '#666',
  },
  similarity: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  memoryContent: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 12,
  },
  memoryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoryTime: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 16,
    color: '#666',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  multilineInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  weightSection: {
    marginBottom: 16,
  },
  weightLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  weightPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  weightOption: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedWeight: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  weightText: {
    fontSize: 16,
    color: '#333',
  },
  selectedWeightText: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#999',
    borderRadius: 6,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
});
