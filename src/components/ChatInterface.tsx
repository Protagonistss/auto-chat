import { useState, useRef, useEffect } from 'react'
import type { Message, Attachment } from '@/types/chat'
import styles from './ChatInterface.module.css'

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (content: string, attachments?: Attachment[]) => void | Promise<void>
  onBuild?: (xmlContent: string) => void | Promise<void>
  placeholder?: string
  disabled?: boolean
}

export function ChatInterface({
  messages,
  onSendMessage,
  onBuild,
  placeholder = '输入消息...',
  disabled = false
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [buildingMessageId, setBuildingMessageId] = useState<string | null>(null)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 切换思考内容展开状态
  const toggleThinking = (messageId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // 获取文件图标
  const getFileIcon = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️'
    if (type.startsWith('video/')) return '🎬'
    if (type.startsWith('audio/')) return '🎵'
    if (type.includes('pdf')) return '📕'
    if (type.includes('word') || type.includes('document')) return '📘'
    if (type.includes('excel') || type.includes('spreadsheet')) return '📗'
    if (type.includes('powerpoint') || type.includes('presentation')) return '📙'
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '📦'
    return '📄'
  }

  // 处理文件选择
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return

    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      file
    }))

    setAttachments((prev) => [...prev, ...newAttachments])
  }

  // 处理文件输入变化
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 移除附件
  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id))
  }

  // 处理拖拽事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // 处理发送消息
  const handleSend = async () => {
    const trimmed = input.trim()
    if ((!trimmed && attachments.length === 0) || disabled) return

    setInput('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    await onSendMessage(trimmed, attachments)
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

  // 渲染消息内容（支持代码块）
  const renderContent = (content: string, messageId?: string, isThinkingContent?: boolean) => {
    // 检测代码块 ```lang...```
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
    const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = []
    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // 添加代码块前的文本
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        })
      }
      // 添加代码块
      parts.push({
        type: 'code',
        lang: match[1] || '',
        content: match[2]
      })
      lastIndex = match.index + match[0].length
    }

    // 添加剩余文本
    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      })
    }

    // 如果没有代码块，返回原始内容
    if (parts.length === 0) {
      return content
    }

    // 渲染带代码块的内容
    return parts.map((part, index) => {
      if (part.type === 'code') {
        // 调试日志
        console.log('代码块:', { lang: part.lang, hasOrm: part.content.includes('<orm'), onBuild: !!onBuild, messageId, isThinkingContent })
        // 支持 xml 和其他包含 XML 配置的代码块
        // 只有在非思考区域、是 XML、有 onBuild 回调、有 messageId 时才显示构建按钮
        const isXml = (part.lang === 'xml' || (!part.lang && part.content.includes('<orm'))) && onBuild && messageId && !isThinkingContent
        return (
          <div key={index} className={styles.codeBlock}>
            {part.lang && <div className={styles.codeLang}>{part.lang}</div>}
            <pre><code>{part.content}</code></pre>
            {isXml && (
              <button
                onClick={() => handleBuild({ id: messageId, role: 'assistant', content, timestamp: 0 })}
                disabled={buildingMessageId === messageId}
                className={styles.buildButton}
              >
                {buildingMessageId === messageId ? '构建中...' : '构建'}
              </button>
            )}
          </div>
        )
      }
      return <span key={index}>{part.content}</span>
    })
  }

  // 提取 XML 代码块内容
  const extractXmlContent = (content: string): string | null => {
    const match = content.match(/```xml\n([\s\S]*?)```/)
    return match ? match[1].trim() : null
  }

  // 处理构建点击
  const handleBuild = async (message: Message) => {
    const xmlContent = extractXmlContent(message.content)
    if (!xmlContent || !onBuild) return

    setBuildingMessageId(message.id)
    try {
      await onBuild(xmlContent)
    } finally {
      setBuildingMessageId(null)
    }
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
                  {message.attachments && message.attachments.length > 0 && (
                    <div className={styles.attachments}>
                      {message.attachments.map((attachment) => (
                        <div key={attachment.id} className={styles.attachment}>
                          <span className={styles.attachmentIcon}>
                            {getFileIcon(attachment.type)}
                          </span>
                          <div className={styles.attachmentInfo}>
                            <div className={styles.attachmentName}>{attachment.name}</div>
                            <div className={styles.attachmentSize}>
                              {formatFileSize(attachment.size)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {message.loading ? (
                    <div className={styles.messageBubble}>
                      <div className={styles.loadingContainer}>
                        <div className={styles.loadingSpinner} />
                        <span className={styles.loadingText}>{message.statusText || '处理中...'}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 思考内容 */}
                      {message.thinkingContent && (
                        <div className={styles.thinkingSection}>
                          <button
                            className={styles.thinkingToggle}
                            onClick={() => toggleThinking(message.id)}
                          >
                            <span className={styles.thinkingIcon}>
                              {expandedThinking.has(message.id) ? '▼' : '▶'}
                            </span>
                            <span className={styles.thinkingLabel}>🧠 思考过程</span>
                          </button>
                          {expandedThinking.has(message.id) && (
                            <div className={styles.thinkingContent}>
                              {renderContent(message.thinkingContent, undefined, true)}
                            </div>
                          )}
                        </div>
                      )}
                      {/* 回答内容 - 始终显示在思考区域之外 */}
                      {message.content && (
                        <div className={styles.answerSection}>
                          {message.thinkingContent && (
                            <div className={styles.answerLabel}>💡 回答</div>
                          )}
                          <div className={styles.messageBubble}>
                            {renderContent(message.content, message.role === 'assistant' ? message.id : undefined, false)}
                          </div>
                        </div>
                      )}
                      {/* 调试：显示 content 和 thinkingContent 的长度 */}
                      {process.env.NODE_ENV === 'development' && (
                        <div style={{ fontSize: '10px', color: '#999' }}>
                          debug: content={message.content?.length || 0} thinking={message.thinkingContent?.length || 0}
                        </div>
                      )}
                    </>
                  )}
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
      <div
        className={styles.inputContainer}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {attachments.length > 0 && (
          <div className={styles.attachmentsPreview}>
            {attachments.map((attachment) => (
              <div key={attachment.id} className={styles.attachmentPreview}>
                <span className={styles.attachmentIcon}>{getFileIcon(attachment.type)}</span>
                <span className={styles.attachmentName}>{attachment.name}</span>
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className={styles.removeAttachment}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.inputWrapper}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className={styles.fileInput}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={styles.attachButton}
            title="添加附件"
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isDragging ? '松开以上传文件' : placeholder}
            disabled={disabled}
            className={styles.textarea}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || disabled}
            className={styles.sendButton}
          >
            {disabled ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
