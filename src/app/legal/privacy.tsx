import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>隐私政策</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. 信息收集</Text>
        <Text style={styles.text}>
          我们收集您直接提供的信息（如注册信息、游戏内容），以及自动收集的设备信息、使用日志等，用于提供服务、优化体验。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. 信息使用</Text>
        <Text style={styles.text}>
          我们使用收集的信息用于提供服务、改进功能、个性化推荐、安全保障等目的，不会将信息用于其他非法或与收集目的无关的用途。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. 信息共享</Text>
        <Text style={styles.text}>
          我们不会将您的个人信息出售给第三方，仅在以下情况下可能共享信息：获得您的同意、法律法规要求、保护我们或他人的合法权益。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. 信息存储与安全</Text>
        <Text style={styles.text}>
          我们采用行业标准的安全措施保护您的信息，包括加密存储、访问控制等。您的信息存储在中国境内的服务器上。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. 您的权利</Text>
        <Text style={styles.text}>
          您有权访问、更正、删除您的个人信息，有权撤回同意、注销账户，有权获取个人信息副本。您可以通过设置页面或联系我们行使这些权利。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. 儿童隐私</Text>
        <Text style={styles.text}>
          我们的服务不面向13岁以下的儿童，如果我们发现收集了儿童信息，会立即删除相关数据。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. 政策更新</Text>
        <Text style={styles.text}>
          我们可能不时更新本隐私政策，更新后的政策会在应用内公示。请定期查看本政策以了解最新内容。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>8. 联系我们</Text>
        <Text style={styles.text}>
          如果您对本隐私政策有任何疑问，请通过以下方式联系我们：
          {'\n'}邮箱：privacy@example.com
          {'\n'}电话：400-123-4567
        </Text>
      </View>

      <Text style={styles.updateDate}>最后更新：2024年1月1日</Text>
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
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
    textAlign: 'justify',
  },
  updateDate: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});
