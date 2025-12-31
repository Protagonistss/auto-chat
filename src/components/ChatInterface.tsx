import { useState, useRef, useEffect } from 'react'
import type { Message } from '@/types/chat'
import styles from './ChatInterface.module.css'

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (content: string) => void | Promise<void>
  placeholder?: string
  disabled?: boolean
}

export function ChatInterface({
  messages,
  onSendMessage,
  placeholder = '输入消息...',
  disabled = false
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 处理发送消息
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await onSendMessage(trimmed)
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 自动调整输入框高度
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target
    setInput(textarea.value)

    // 重置高度以获取正确的 scrollHeight
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }

  return (
    <div className={styles.chatContainer}>
      {/* 消息列表区域 */}
      <div className={styles.messagesContainer}>
        <div className={styles.messagesList}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <p>开始对话...</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${styles[message.role]}`}
              >
                <div className={styles.messageAvatar}>
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className={styles.messageContent}>
                  <div className={styles.messageBubble}>{message.content}</div>
                  <div className={styles.messageTime}>
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={styles.textarea}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || disabled}
            className={styles.sendButton}
          >
            {disabled ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
