import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch } from 'react-native';
import { useSettings } from '@/hooks/useSettings';
import { ThemeMode } from '@/stores/settings';
import { useState } from 'react';

export default function SettingsScreen() {
  const { settings, updateSetting } = useSettings();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || '');
  const [token, setToken] = useState(settings.token || '');
  const [ttsRate, setTtsRate] = useState(settings.ttsRate || 1);
  const [themeMode, setThemeMode] = useState(settings.themeMode || 'system');

  const handleSave = async () => {
    await updateSetting({
      baseUrl,
      token,
      ttsRate,
      themeMode,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>设置</Text>

      {/* 服务器设置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>服务器</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>服务器地址</Text>
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.5:18000"
            value={baseUrl}
            onChangeText={setBaseUrl}
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>访问令牌</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入访问令牌"
            value={token}
            onChangeText={setToken}
            secureTextEntry
          />
        </View>
      </View>

      {/* 外观设置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>外观</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>主题</Text>
          <View style={styles.radioGroup}>
            {['system', 'light', 'dark'].map(option => (
              <TouchableOpacity
                key={option}
                style={styles.radioOption}
                onPress={() => setThemeMode(option as ThemeMode)}
              >
                <View style={[styles.radio, themeMode === option && styles.radioSelected]}>
                  {themeMode === option && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioText}>
                  {option === 'light' ? '浅色' : option === 'dark' ? '深色' : '跟随系统'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* 功能设置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>功能</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>TTS播放速率</Text>
          <View style={styles.radioGroup}>
            {[0.5, 1, 1.5, 2].map(rate => (
              <TouchableOpacity
                key={rate}
                style={styles.radioOption}
                onPress={() => setTtsRate(rate)}
              >
                <View style={[styles.radio, ttsRate === rate && styles.radioSelected]}>
                  {ttsRate === rate && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.radioText}>{rate}x</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* 关于 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>关于</Text>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>版本</Text>
          <Text style={styles.settingValue}>1.0.0</Text>
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>开发者</Text>
          <Text style={styles.settingValue}>Your Company</Text>
        </View>
        <TouchableOpacity style={styles.linkItem}>
          <Text style={styles.linkText}>服务条款</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkItem}>
          <Text style={styles.linkText}>隐私政策</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>保存设置</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
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
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
  },
  settingItem: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#007AFF',
  },
  radioDot: {
    width: 10,
    height: 10,
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  radioText: {
    fontSize: 16,
    color: '#333',
  },
  switchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  linkItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
  },
  saveButton: {
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
