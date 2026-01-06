import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Paperclip,
  X,
  ChevronRight,
  ChevronDown,
  Brain,
  User,
  Bot,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileBox,
  Cpu,
  Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import type { Message, Attachment } from '@/types/chat'
import { chatApi } from '@/services/chatApi'
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
  const [builtMessageIds, setBuiltMessageIds] = useState<Set<string>>(new Set()) // 已构建的消息
  const [writtenMessageIds, setWrittenMessageIds] = useState<Set<string>>(new Set()) // 已写入的消息
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
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon size={20} />
    if (type.startsWith('video/')) return <Video size={20} />
    if (type.startsWith('audio/')) return <Music size={20} />
    if (type.includes('pdf') || type.includes('word') || type.includes('document')) return <FileText size={20} />
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return <FileBox size={20} />
    return <FileText size={20} />
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
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
    const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = []
    let lastIndex = 0
    let match

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: content.slice(lastIndex, match.index)
        })
      }
      parts.push({
        type: 'code',
        lang: match[1] || '',
        content: match[2]
      })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex)
      })
    }

    if (parts.length === 0) {
      return content
    }

    return parts.map((part, index) => {
      if (part.type === 'code') {
        // 检测是否为 XML 代码块
        const isXmlCode = part.lang === 'xml' || (!part.lang && part.content.includes('<'))

        // 调试日志
        console.log('[ChatInterface] 代码块信息:', {
          lang: part.lang,
          isXmlCode,
          messageId,
          isThinkingContent,
          hasOnBuild: !!onBuild,
          contentLength: part.content.length,
          contentPreview: part.content.substring(0, 200),
          fullContent: part.content
        })

        const xmlType = isXmlCode && messageId && !isThinkingContent ? chatApi.detectXmlType(part.content) : null

        console.log('[ChatInterface] XML 类型检测结果:', xmlType, {
          hasNameAttribute: /<entity\s+name=/.test(part.content),
          hasEntityTag: /<entity/.test(part.content)
        })

        const canBuild = isXmlCode && xmlType && onBuild && messageId && !isThinkingContent
        const isWritten = messageId && writtenMessageIds.has(messageId) // 已写入
        const isBuilt = messageId && builtMessageIds.has(messageId) // 已构建
        const isBuilding = buildingMessageId === messageId // 正在操作中

        console.log('[ChatInterface] 按钮状态:', { canBuild, isWritten, isBuilt, isBuilding })

        // 类型显示名称映射
        const typeLabels: Record<string, string> = {
          'orm': 'ORM',
          'config': '配置',
          'api': 'API'
        }

        return (
          <div key={index} className={styles.codeBlock}>
            <div className={styles.codeHeader}>
              <span className={styles.codeLang}>{part.lang || (isXmlCode ? 'xml' : '')}</span>
              {canBuild && (
                <>
                  {/* 写入按钮：未写入时显示 */}
                  {!isWritten && (
                    <button
                      onClick={() => handleWriteXml(part.content, messageId!)}
                      disabled={isBuilding}
                      className={styles.writeButton}
                    >
                      {isBuilding ? (
                        <>
                          <Loader2 size={14} className={styles.spin} />
                          <span>写入中...</span>
                        </>
                      ) : (
                        <>
                          <Cpu size={14} />
                          <span>写入 {typeLabels[xmlType] || xmlType}</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* 构建按钮：已写入但未构建时显示 */}
                  {isWritten && !isBuilt && (
                    <button
                      onClick={() => handleBuildXml(messageId!)}
                      disabled={isBuilding}
                      className={styles.buildButton}
                    >
                      {isBuilding ? (
                        <>
                          <Loader2 size={14} className={styles.spin} />
                          <span>构建中...</span>
                        </>
                      ) : (
                        <>
                          <Cpu size={14} />
                          <span>构建</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* 已构建状态 */}
                  {isBuilt && (
                    <button
                      disabled
                      className={clsx(styles.buildButton, styles.builtButton)}
                    >
                      <Cpu size={14} />
                      <span>已构建</span>
                    </button>
                  )}
                </>
              )}
            </div>
            <pre><code>{part.content}</code></pre>
          </div>
        )
      }
      return <span key={index}>{part.content}</span>
    })
  }

  // 处理写入点击
  const handleWriteXml = async (xmlContent: string, messageId: string) => {
    if (!onBuild) return

    setBuildingMessageId(messageId)
    try {
      await onBuild(xmlContent)
      // 写入成功后，标记为已写入
      setWrittenMessageIds(prev => new Set(prev).add(messageId))
    } catch (error) {
      console.error('写入失败:', error)
      throw error
    } finally {
      setBuildingMessageId(null)
    }
  }

  // 处理构建点击
  const handleBuildXml = async (messageId: string) => {
    // 这里应该调用实际的构建API
    // 目前先标记为已构建
    setBuildingMessageId(messageId)
    try {
      // TODO: 调用构建API
      await new Promise(resolve => setTimeout(resolve, 1000)) // 模拟构建过程
      setBuiltMessageIds(prev => new Set(prev).add(messageId))
    } catch (error) {
      console.error('构建失败:', error)
    } finally {
      setBuildingMessageId(null)
    }
  }

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messagesContainer}>
        <div className={styles.messagesList}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Bot size={48} strokeWidth={1.5} />
              </div>
              <h3>欢迎使用 AI 助手</h3>
              <p>有什么我可以帮您的吗？</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={clsx(styles.message, styles[message.role])}
              >
                <div className={styles.messageAvatar}>
                  {message.role === 'user' ? <User size={18} /> : <Bot size={18} />}
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
                        <Loader2 className={styles.spin} size={18} />
                        <span className={styles.loadingText}>{message.statusText || '处理中...'}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.thinkingContent && (
                        <div className={styles.thinkingSection}>
                          <button
                            className={styles.thinkingToggle}
                            onClick={() => toggleThinking(message.id)}
                          >
                            <span className={styles.thinkingIcon}>
                              {expandedThinking.has(message.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <Brain size={14} />
                            <span className={styles.thinkingLabel}>思考过程</span>
                          </button>
                          {expandedThinking.has(message.id) && (
                            <div className={styles.thinkingContent}>
                              {renderContent(message.thinkingContent, undefined, true)}
                            </div>
                          )}
                        </div>
                      )}
                      {message.content && (
                        <div className={styles.answerSection}>
                          <div className={styles.messageBubble}>
                            {renderContent(message.content, message.role === 'assistant' ? message.id : undefined, false)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className={styles.messageTime}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div
        className={clsx(styles.inputContainer, isDragging && styles.dragging)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={styles.inputArea}>
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
                    <X size={14} />
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
              <Paperclip size={20} />
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
              {disabled ? <Loader2 className={styles.spin} size={20} /> : <Send size={20} />}
            </button>
          </div>
          <div className={styles.inputHint}>
            按 Enter 发送，Shift + Enter 换行
          </div>
        </div>
      </div>
    </div>
  )
}
