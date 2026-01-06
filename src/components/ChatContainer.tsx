import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Square, Brain, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
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
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    const initConversation = async () => {
      if (propConversationId) {
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
  }, [propConversationId])

  // 发送消息
  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!conversationId) {
        setError('会话未初始化')
        return
      }

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments,
      }
      setMessages((prev) => [...prev, userMessage])

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

        let fileIds: string[] = []
        if (attachments && attachments.length > 0) {
          for (const attachment of attachments) {
            if (attachment.file) {
              const result = await chatApi.uploadFile(conversationId, attachment.file)
              fileIds.push(result.file_id)
            }
          }
        }

        const controller = new AbortController()
        setAbortController(controller)

        await chatApi.sendMessageStream(
          conversationId,
          content,
          fileIds.length > 0 ? fileIds : undefined,
          {
            signal: controller.signal,
            callbacks: {
              onStart: (data) => {
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
                const currentId = currentMessageIdRef.current
                if (!currentId) return
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
          const currentId = currentMessageIdRef.current
          if (currentId) {
            setMessages((prev) => prev.filter((msg) => msg.id !== currentId))
          }
        } else {
          const errorMessage = err instanceof Error ? err.message : '发送消息失败'
          setError(errorMessage)
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

  const handleCancel = useCallback(() => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setIsLoading(false)
    }
  }, [abortController])

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

  const handleBuild = async (xmlContent: string) => {
    try {
      setError(null)
      const result = await chatApi.writeOrmEntity(xmlContent, { source: 'chat' })
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
        <Loader2 className={styles.spinner} size={40} />
        <p>初始化对话...</p>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      {error && (
        <div className={styles.errorBanner}>
          <div className={styles.errorContent}>
            <span>{error}</span>
            <button onClick={() => setError(null)} className={styles.closeButton}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={handleReset} className={styles.resetButton} disabled={isLoading}>
            <Plus size={16} />
            <span>新对话</span>
          </button>
        </div>
        
        <div className={styles.headerRight}>
          <label className={clsx(styles.thinkingToggle, enableThinking && styles.active)}>
            <input
              type="checkbox"
              checked={enableThinking}
              onChange={(e) => setEnableThinking(e.target.checked)}
              disabled={isLoading}
            />
            <Brain size={16} />
            <span>思考模式</span>
          </label>
          
          {isLoading && abortController && (
            <button onClick={handleCancel} className={styles.cancelButton}>
              <Square size={14} fill="currentColor" />
              <span>停止生成</span>
            </button>
          )}
        </div>
      </div>

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
