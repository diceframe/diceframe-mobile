import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal, Switch } from 'react-native';
import { useRules } from '@/hooks/useRules';
import { useState } from 'react';
import { Rule } from '@/types';

export default function RulesScreen() {
  const { rules, addRule, updateRule, deleteRule, toggleRule } = useRules();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    content: '', 
    isEnabled: true,
    isDefault: false 
  });

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.content.trim()) return;
    
    if (editingRule) {
      await updateRule(editingRule.id, formData);
    } else {
      await addRule(formData);
    }
    
    setShowAddModal(false);
    setEditingRule(null);
    setFormData({ name: '', content: '', isEnabled: true, isDefault: false });
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      content: rule.content,
      isEnabled: rule.isEnabled,
      isDefault: rule.isDefault,
    });
    setShowAddModal(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>规则管理</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Text style={styles.buttonText}>添加规则</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rules}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.ruleItem}>
            <View style={styles.ruleHeader}>
              <Text style={styles.ruleName}>{item.name}</Text>
              <View style={styles.ruleMeta}>
                {item.isDefault && <Text style={styles.defaultTag}>默认</Text>}
                <Switch
                  value={item.isEnabled}
                  onValueChange={() => toggleRule(item.id)}
                  trackColor={{ false: '#ddd', true: '#007AFF' }}
                />
              </View>
            </View>
            <Text style={styles.ruleContent} numberOfLines={2}>{item.content}</Text>
            <View style={styles.ruleActions}>
              <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
                <Text style={styles.actionText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteRule(item.id)}>
                <Text style={styles.actionText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无规则</Text>}
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingRule ? '编辑规则' : '添加规则'}
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="规则名称"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />
            
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="规则内容"
              value={formData.content}
              onChangeText={(text) => setFormData({ ...formData, content: text })}
              multiline
              numberOfLines={6}
            />
            
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>启用规则：</Text>
              <Switch
                value={formData.isEnabled}
                onValueChange={(value) => setFormData({ ...formData, isEnabled: value })}
                trackColor={{ false: '#ddd', true: '#007AFF' }}
              />
            </View>
            
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>设为默认规则：</Text>
              <Switch
                value={formData.isDefault}
                onValueChange={(value) => setFormData({ ...formData, isDefault: value })}
                trackColor={{ false: '#ddd', true: '#007AFF' }}
              />
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddModal(false);
                setEditingRule(null);
                setFormData({ name: '', content: '', isEnabled: true, isDefault: false });
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
  ruleItem: {
    padding: 16,
    marginBottom: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  ruleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ruleName: {
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
  },
  ruleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  defaultTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#34C759',
    color: '#fff',
    borderRadius: 4,
    fontSize: 12,
  },
  ruleContent: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  ruleActions: {
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  switchLabel: {
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
