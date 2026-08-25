import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal } from 'react-native';
import { useCharacters } from '@/hooks/useCharacters';
import { useState } from 'react';
import { Character } from '@/types';

export default function CharactersScreen() {
  const { characters, addCharacter, updateCharacter, deleteCharacter, npcs, addNpc } = useCharacters();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', avatar: '' });

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    
    if (editingCharacter) {
      await updateCharacter(editingCharacter.id, formData);
    } else {
      await addCharacter(formData);
    }
    
    setShowAddModal(false);
    setEditingCharacter(null);
    setFormData({ name: '', description: '', avatar: '' });
  };

  const handleEdit = (character: Character) => {
    setEditingCharacter(character);
    setFormData({
      name: character.name,
      description: character.description || '',
      avatar: character.avatar || '',
    });
    setShowAddModal(true);
  };

  const handleAddNpc = async () => {
    const name = prompt('请输入NPC名称');
    if (name) {
      await addNpc({ name, description: '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>角色管理</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.addButton} onPress={handleAddNpc}>
            <Text style={styles.buttonText}>添加NPC</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Text style={styles.buttonText}>添加角色</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>玩家角色</Text>
      <FlatList
        data={characters}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.characterItem}>
            <View style={styles.characterInfo}>
              <Text style={styles.characterName}>{item.name}</Text>
              {item.description && <Text style={styles.characterDesc}>{item.description}</Text>}
            </View>
            <View style={styles.characterActions}>
              <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
                <Text style={styles.actionText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteCharacter(item.id)}>
                <Text style={styles.actionText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无角色</Text>}
      />

      <Text style={styles.sectionTitle}>NPC列表</Text>
      <FlatList
        data={npcs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.characterItem}>
            <View style={styles.characterInfo}>
              <Text style={styles.characterName}>{item.name}</Text>
              {item.description && <Text style={styles.characterDesc}>{item.description}</Text>}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无NPC</Text>}
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCharacter ? '编辑角色' : '添加角色'}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="角色名称"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />
            
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="角色描述"
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              multiline
              numberOfLines={4}
            />
            
            <TextInput
              style={styles.input}
              placeholder="头像URL（可选）"
              value={formData.avatar}
              onChangeText={(text) => setFormData({ ...formData, avatar: text })}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddModal(false);
                setEditingCharacter(null);
                setFormData({ name: '', description: '', avatar: '' });
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
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 12,
  },
  characterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 4,
  },
  characterDesc: {
    fontSize: 14,
    color: '#666',
  },
  characterActions: {
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
    marginTop: 16,
    fontSize: 14,
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
    height: 100,
    textAlignVertical: 'top',
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
