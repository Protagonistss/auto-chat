import { useState } from 'react'
import { ChatInterface } from './components/ChatInterface'
import type { Message } from './types/chat'
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

  const handleSendMessage = async (content: string) => {
    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, userMessage])

    // 模拟AI回复
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `我收到了你的消息："${content}"`,
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
