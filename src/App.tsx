import { useState } from 'react'
import { ChatInterface } from './components/ChatInterface'
import type { Message, Attachment } from './types/chat'
import styles from './App.module.css'

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是AI助手，有什么可以帮助你的吗？',
      timestamp: Date.now()
    }
  ])

  const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined
    }
    setMessages((prev) => [...prev, userMessage])

    // 模拟AI回复
    setTimeout(() => {
      let replyContent = `我收到了你的消息`
      if (content) {
        replyContent += `"${content}"`
      }
      if (attachments && attachments.length > 0) {
        replyContent += ` 和 ${attachments.length} 个附件`
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyContent,
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, aiMessage])
    }, 1000)
  }

  return (
    <div className={styles.app}>
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        placeholder="输入消息与AI对话..."
      />
    </div>
  )
}

export default App
