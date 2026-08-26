import { LegalDocument } from '@/components/patterns/legal-document'

const sections = [
  { title: '1. 服务概述', content: '我们提供基于 AI 的角色扮演游戏服务，包括角色创建、游戏存档和联机对局等功能。' },
  { title: '2. 用户账户', content: '部分服务需要验证身份。请妥善保管访问凭据，并对该身份下进行的操作负责。' },
  { title: '3. 服务使用规则', content: '使用本服务时需遵守适用法律法规，不得干扰服务运行或侵犯他人的合法权益。' },
  { title: '4. 知识产权', content: '软件、界面和文档等内容受知识产权法律保护。用户创建内容的权利归属依适用条款与法律确定。' },
  { title: '5. 服务变更与终止', content: '服务内容可能随版本迭代而调整。您可以随时停止使用服务并清理本机保存的身份信息。' },
  { title: '6. 免责声明', content: '服务按现状提供。在法律允许范围内，因不可抗力、网络或第三方服务造成的中断不构成保证责任。' },
  { title: '7. 法律适用', content: '本条款的解释与争议处理遵循适用法律。' },
]

export default function TermsScreen() {
  return <LegalDocument title="服务条款" subtitle="使用 DiceFrame 前请阅读" sections={sections} updated="2024 年 1 月 1 日" />
}
