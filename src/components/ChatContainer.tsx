import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatInterface } from './ChatInterface'
import type { Message, Attachment } from '@/types/chat'
import { chatApi } from '@/services/chatApi'
import styles from './ChatContainer.module.css'

interface ChatContainerProps {
  conversationId?: string
  onConversationCreated?: (id: string) => void
}

export function ChatContainer({
  conversationId: propConversationId,
  onConversationCreated
}: ChatContainerProps) {
  const [conversationId, setConversationId] = useState<string | undefined>(propConversationId)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // 使用 ref 存储回调，避免作为依赖项
  const onConversationCreatedRef = useRef(onConversationCreated)
  onConversationCreatedRef.current = onConversationCreated

  // 防止 StrictMode 导致的重复请求
  const isInitializedRef = useRef(false)

  // 初始化会话
  useEffect(() => {
    // 如果已经初始化过，跳过
    if (isInitializedRef.current) {
      return
    }
    // 立即设置标志位，防止异步执行期间重复调用
    isInitializedRef.current = true

    const initConversation = async () => {
      if (propConversationId) {
        // 加载现有会话
        try {
          setIsInitializing(true)
          const detail = await chatApi.getConversation(propConversationId)
          setMessages(
            detail.messages.map((msg) => ({
              id: `${detail.conversation_id}-${msg.timestamp}`,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
            }))
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : '加载会话失败')
        } finally {
          setIsInitializing(false)
        }
      } else {
        // 创建新会话
        try {
          setIsInitializing(true)
          const result = await chatApi.createConversation('新对话')
          setConversationId(result.conversation_id)
          onConversationCreatedRef.current?.(result.conversation_id)
        } catch (err) {
          setError(err instanceof Error ? err.message : '创建会话失败')
        } finally {
          setIsInitializing(false)
        }
      }
    }

    initConversation()
    // 只依赖 propConversationId
  }, [propConversationId])

  // 发送消息
  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!conversationId) {
        setError('会话未初始化')
        return
      }

      // 添加用户消息到列表
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments,
      }
      setMessages((prev) => [...prev, userMessage])

      // 添加临时的 assistant 消息（加载中）
      const tempAssistantMessage: Message = {
        id: `assistant-temp-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, tempAssistantMessage])

      try {
        setIsLoading(true)
        setError(null)

        // 上传文件（如果有）
        let fileIds: string[] = []
        if (attachments && attachments.length > 0) {
          for (const attachment of attachments) {
            if (attachment.file) {
              const result = await chatApi.uploadFile(conversationId, attachment.file)
              fileIds.push(result.file_id)
            }
          }
        }

        // 发送消息
        const { task_id } = await chatApi.sendMessage(conversationId, content, fileIds)

        // 轮询任务结果
        const task = await chatApi.pollTask(task_id, {
          interval: 1000,
          maxAttempts: 120,
          onProgress: (task) => {
            // 更新 loading 状态和状态文本
            const statusMap: Record<string, string> = {
              pending: '等待中...',
              processing: 'AI 思考中...',
              success: '完成',
              failed: '失败'
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempAssistantMessage.id
                  ? {
                      ...msg,
                      loading: task.status !== 'success' && task.status !== 'failed',
                      statusText: statusMap[task.status] || task.status
                    }
                  : msg
              )
            )
          },
        })

        // 更新 assistant 消息
        if (task.result_message) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantMessage.id
                ? {
                    id: task.result_message.id,
                    role: 'assistant',
                    content: task.result_message.content,
                    timestamp: Date.now(),
                  }
                : msg
            )
          )
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '发送消息失败'
        setError(errorMessage)
        // 移除临时的 assistant 消息
        setMessages((prev) => prev.filter((msg) => msg.id !== tempAssistantMessage.id))
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId]
  )

  // 重置会话
  const handleReset = async () => {
    setMessages([])
    setError(null)
    setIsInitializing(true)

    try {
      const result = await chatApi.createConversation('新对话')
      setConversationId(result.conversation_id)
      onConversationCreatedRef.current?.(result.conversation_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败')
    } finally {
      setIsInitializing(false)
    }
  }

  // 处理构建
  const handleBuild = async (xmlContent: string) => {
    try {
      setError(null)
      const taskId = await chatApi.submitBuildTask(xmlContent)
      const result = await chatApi.pollBuildTask(taskId, {
        interval: 1000,
        maxAttempts: 120,
        onProgress: (task) => {
          // 可选：显示构建进度
        },
      })
      // 构建成功
      console.log('构建成功:', result)
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '构建失败'
      setError(errorMessage)
      throw err
    }
  }

  if (isInitializing) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>初始化对话...</p>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {/* 错误提示 */}
      {error && (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className={styles.closeButton}>
            ×
          </button>
        </div>
      )}

      {/* 顶部栏 - 悬浮 */}
      <div className={styles.header}>
        <button onClick={handleReset} className={styles.resetButton} disabled={isLoading}>
          新对话
        </button>
      </div>

      {/* 聊天界面 */}
      <ChatInterface
        messages={messages}
        onSendMessage={handleSendMessage}
        onBuild={handleBuild}
        placeholder="输入消息..."
        disabled={isLoading}
      />
    </div>
  )
}
