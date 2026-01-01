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
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [enableThinking, setEnableThinking] = useState(false)

  // 使用 ref 存储回调，避免作为依赖项
  const onConversationCreatedRef = useRef(onConversationCreated)
  onConversationCreatedRef.current = onConversationCreated

  // 使用 ref 存储当前消息 ID，避免闭包问题
  const currentMessageIdRef = useRef<string | null>(null)

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
      const tempAssistantId = `assistant-temp-${Date.now()}`
      currentMessageIdRef.current = tempAssistantId
      const tempAssistantMessage: Message = {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        loading: true,
        statusText: '连接中...',
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

        // 创建 AbortController
        const controller = new AbortController()
        setAbortController(controller)

        // 调试：确认 enableThinking 的值
        console.log('=== handleSendMessage ===')
        console.log('enableThinking 值:', enableThinking, '类型:', typeof enableThinking)
        console.log('复选框元素值:', document.querySelector('input[type="checkbox"]')?.checked)

        // 流式接收消息
        await chatApi.sendMessageStream(
          conversationId,
          content,
          fileIds.length > 0 ? fileIds : undefined,
          {
            signal: controller.signal,
            callbacks: {
              onStart: (data) => {
                console.log('SSE 开始:', data.message_id)
                // 更新 ref 为新的消息 ID
                currentMessageIdRef.current = data.message_id
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantId
                      ? { ...msg, id: data.message_id, statusText: 'AI 思考中...' }
                      : msg
                  )
                )
              },
              onChunk: (chunk, thinking) => {
                // 使用 ref 获取当前消息 ID
                const currentId = currentMessageIdRef.current
                if (!currentId) return
                // 流式追加内容
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === currentId
                      ? thinking
                        ? {
                            ...msg,
                            thinkingContent: (msg.thinkingContent || '') + chunk,
                            loading: false,
                          }
                        : {
                            ...msg,
                            content: msg.content + chunk,
                            loading: false,
                            statusText: undefined,
                          }
                      : msg
                  )
                )
              },
              onEnd: (data) => {
                console.log('SSE 结束:', data.message_id)
                const currentId = currentMessageIdRef.current
                if (!currentId) return
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === currentId || msg.id === data.message_id
                      ? {
                          ...msg,
                          id: data.message_id,
                          loading: false,
                          statusText: undefined,
                        }
                      : msg
                  )
                )
              },
              onError: (error) => {
                console.error('SSE 错误:', error)
                setError(error)
                const currentId = currentMessageIdRef.current
                if (!currentId) return
                setMessages((prev) =>
                  prev.filter((msg) => msg.id !== currentId)
                )
              },
            },
          },
          enableThinking
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('消息发送已取消')
          // 清理临时消息
          const currentId = currentMessageIdRef.current
          if (currentId) {
            setMessages((prev) => prev.filter((msg) => msg.id !== currentId))
          }
        } else {
          const errorMessage = err instanceof Error ? err.message : '发送消息失败'
          setError(errorMessage)
          // 移除临时的 assistant 消息
          const currentId = currentMessageIdRef.current
          if (currentId) {
            setMessages((prev) => prev.filter((msg) => msg.id !== currentId))
          }
        }
      } finally {
        setIsLoading(false)
        setAbortController(null)
        currentMessageIdRef.current = null
      }
    },
    [conversationId, enableThinking]
  )

  // 取消当前请求
  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
    }
  }, [abortController])

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
        <label className={styles.thinkingToggle}>
          <input
            type="checkbox"
            checked={enableThinking}
            onChange={(e) => setEnableThinking(e.target.checked)}
            disabled={isLoading}
          />
          <span>思考模式</span>
        </label>
        {isLoading && abortController && (
          <button onClick={handleCancel} className={styles.cancelButton}>
            停止生成
          </button>
        )}
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
