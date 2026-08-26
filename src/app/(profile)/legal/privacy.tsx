import { LegalDocument } from '@/components/patterns/legal-document'

const sections = [
  { title: '1. 信息收集', content: '服务会处理您主动提供的连接信息、身份信息和游戏内容，以及为诊断运行状态所需的设备与日志信息。' },
  { title: '2. 信息使用', content: '相关信息用于连接服务器、运行对局、保存偏好、改进功能和保障服务安全。' },
  { title: '3. 信息共享', content: '我们不会出售您的个人信息。仅在获得授权、履行服务或法律要求时向必要主体提供信息。' },
  { title: '4. 存储与安全', content: 'DiceFrame 支持连接自托管服务器。数据实际存储位置和安全措施取决于您所连接的服务实例。' },
  { title: '5. 您的权利', content: '您可以在“我的”中清除本机保存的 GM 与玩家身份；服务器中的数据管理请联系对应实例的管理者。' },
  { title: '6. 儿童隐私', content: '未成年人应在监护人指导下使用本服务。发现不当收集的信息后应及时联系对应服务管理者处理。' },
  { title: '7. 政策更新', content: '政策可能随功能和法律要求变化，更新版本会随应用发布。' },
]

export default function PrivacyScreen() {
  return <LegalDocument title="隐私政策" subtitle="了解数据如何在客户端与服务器间流动" sections={sections} updated="2024 年 1 月 1 日" />
}
