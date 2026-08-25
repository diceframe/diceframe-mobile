import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>服务条款</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. 服务概述</Text>
        <Text style={styles.text}>
          我们提供基于AI的角色扮演游戏服务，包括但不限于角色创建、游戏存档、在线对战等功能。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. 用户账户</Text>
        <Text style={styles.text}>
          您需要注册账户才能使用部分服务，账户信息请真实有效，不得冒用他人身份。您需要对账户下的所有行为负责。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. 服务使用规则</Text>
        <Text style={styles.text}>
          您在使用本服务时，需遵守国家法律法规，不得用于违法用途，不得干扰服务正常运行，不得侵犯他人合法权益。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. 知识产权</Text>
        <Text style={styles.text}>
          本服务的所有知识产权归我们所有，包括但不限于软件、界面设计、文档等内容。未经许可，不得复制、修改、传播。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. 服务变更与终止</Text>
        <Text style={styles.text}>
          我们有权根据业务需要调整服务内容，或终止部分/全部服务。您也可以随时终止使用服务，注销账户。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>6. 免责条款</Text>
        <Text style={styles.text}>
          本服务按现状提供，在法律允许的最大范围内，不提供任何明示或暗示的保证。因不可抗力导致的服务中断，我们不承担责任。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>7. 法律适用</Text>
        <Text style={styles.text}>
          本协议适用中华人民共和国法律，因本协议引起的争议，由我司所在地有管辖权的人民法院管辖。
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
