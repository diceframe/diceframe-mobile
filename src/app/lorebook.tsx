import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLorebook } from '@/hooks/useLorebook';
import { useState } from 'react';
import { LorebookEntry } from '@/types';

const CATEGORIES = ['世界观', '地点', '物品', '组织', '其他'];

export default function LorebookScreen() {
  const { entries, addEntry, updateEntry, deleteEntry } = useLorebook();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null>(null);
  const [formData, setFormData] = useState({ 
    title: '', 
    content: '', 
    category: '世界观',
    isPublic: false 
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  const filteredEntries = selectedCategory === '全部' 
    ? entries 
    : entries.filter(entry => entry.category === selectedCategory);

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) return;
    
    if (editingEntry) {
      await updateEntry(editingEntry.id, formData);
    } else {
      await addEntry(formData);
    }
    
    setShowAddModal(false);
    setEditingEntry(null);
    setFormData({ title: '', content: '', category: '世界观', isPublic: false });
  };

  const handleEdit = (entry: LorebookEntry) => {
    setEditingEntry(entry);
    setFormData({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      isPublic: entry.isPublic,
    });
    setShowAddModal(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>设定集</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.buttonText}>添加设定</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>分类筛选：</Text>
        <View style={styles.categoryPicker}>
          <Picker
            selectedValue={selectedCategory}
            onValueChange={setSelectedCategory}
            style={styles.picker}
          >
            <Picker.Item label="全部" value="全部" />
            {CATEGORIES.map(category => (
              <Picker.Item key={category} label={category} value={category} />
            ))}
          </Picker>
        </View>
      </View>

      <FlatList
        data={filteredEntries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.entryItem}>
            <View style={styles.entryHeader}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <View style={styles.entryMeta}>
                <Text style={styles.categoryTag}>{item.category}</Text>
                {item.isPublic && <Text style={styles.publicTag}>公开</Text>}
              </View>
            </View>
            <Text style={styles.entryContent} numberOfLines={2}>{item.content}</Text>
            <View style={styles.entryActions}>
              <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
                <Text style={styles.actionText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteEntry(item.id)}>
                <Text style={styles.actionText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无设定条目</Text>}
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingEntry ? '编辑设定' : '添加设定'}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="设定标题"
              value={formData.title}
              onChangeText={(text) => setFormData({ ...formData, title: text })}
            />
            
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>分类：</Text>
              <Picker
                selectedValue={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                style={styles.formPicker}
              >
                {CATEGORIES.map(category => (
                  <Picker.Item key={category} label={category} value={category} />
                ))}
              </Picker>
            </View>
            
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="设定内容"
              value={formData.content}
              onChangeText={(text) => setFormData({ ...formData, content: text })}
              multiline
              numberOfLines={6}
            />
            
            <TouchableOpacity 
              style={styles.checkboxRow}
              onPress={() => setFormData({ ...formData, isPublic: !formData.isPublic })}
            >
              <View style={[styles.checkbox, formData.isPublic && styles.checkedCheckbox]}>
                {formData.isPublic && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>公开设定（其他玩家可见）</Text>
            </TouchableOpacity>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddModal(false);
                setEditingEntry(null);
                setFormData({ title: '', content: '', category: '世界观', isPublic: false });
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
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryPicker: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  picker: {
    height: 40,
  },
  entryItem: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryTitle: {
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
  },
  entryMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#007AFF',
    color: '#fff',
    borderRadius: 4,
    fontSize: 12,
  },
  publicTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#34C759',
    color: '#fff',
    borderRadius: 4,
    fontSize: 12,
  },
  entryContent: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  entryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
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
    maxHeight: '80%',
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
  pickerSection: {
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 16,
    marginBottom: 4,
  },
  formPicker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedCheckbox: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
  },
  checkboxLabel: {
    fontSize: 16,
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
