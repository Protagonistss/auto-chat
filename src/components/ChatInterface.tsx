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
  Loader2,
  Square
} from 'lucide-react'
import { clsx } from 'clsx'
import type { Message, Attachment } from '@/types/chat'
import type { BuildCommandResponse } from '@/services/chatApi'
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
  const [buildResults, setBuildResults] = useState<Record<string, BuildCommandResponse>>({}) // 构建结果
  const [expandedBuildLogs, setExpandedBuildLogs] = useState<Set<string>>(new Set()) // 展开的构建日志
  const [devServerRunning, setDevServerRunning] = useState<Set<string>>(new Set()) // 运行中的开发服务器
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const devServerAbortControllersRef = useRef<Record<string, AbortController>>({}) // 存储开发服务器的 AbortController

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
        const isBuilding = buildingMessageId === messageId // 正在构建中

        // 检查是否可以启动服务：已构建成功 + 不是正在构建中 + 不是正在运行服务
        const buildResult = messageId ? buildResults[messageId] : null
        const canStartDev = messageId && isWritten && isBuilt && !isBuilding && !devServerRunning.has(messageId)
        const isStartingDev = messageId && devServerRunning.has(messageId) // 正在启动开发服务器

        console.log('[ChatInterface] 按钮状态:', { canBuild, isWritten, isBuilt, isBuilding, canStartDev, isStartingDev })

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
            </div>
            <pre><code>{part.content}</code></pre>

            {/* 按钮区域：移到代码块下方 */}
            {canBuild && (
              <div className={styles.codeActions}>
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

                {/* 启动服务按钮：已构建且服务未运行时显示 */}
                {canStartDev && (
                  <button
                    onClick={() => startQuarkusDevServer(messageId!)}
                    disabled={isStartingDev}
                    className={styles.buildButton}
                  >
                    {isStartingDev ? (
                      <>
                        <Loader2 size={14} className={styles.spin} />
                        <span>启动中...</span>
                      </>
                    ) : (
                      <>
                        <Cpu size={14} />
                        <span>启动服务</span>
                      </>
                    )}
                  </button>
                )}

                {/* 服务运行中状态 - 显示停止按钮 */}
                {devServerRunning.has(messageId!) && (
                  <button
                    onClick={() => stopQuarkusDevServer(messageId!)}
                    className={styles.stopButton}
                  >
                    <Square size={14} fill="currentColor" />
                    <span>停止服务</span>
                  </button>
                )}

                {/* 导出 Excel 按钮：已构建后显示 */}
                {isBuilt && !isBuilding && (
                  <button
                    onClick={() => handleExportExcel(messageId!)}
                    disabled={false}
                    className={styles.exportButton}
                  >
                    <FileText size={14} />
                    <span>导出 Excel</span>
                  </button>
                )}

                {/* 服务启动中状态 */}
                {isStartingDev && !devServerRunning.has(messageId!) && buildResult?.phase === 'dev' && (
                  <button
                    disabled
                    className={clsx(styles.buildButton, styles.builtButton)}
                  >
                    <Loader2 size={14} className={styles.spin} />
                    <span>启动中...</span>
                  </button>
                )}

                {/* 已构建但无法启动服务的状态（可选） */}
                {isBuilt && !canStartDev && !isStartingDev && !devServerRunning.has(messageId!) && (
                  <button
                    disabled
                    className={clsx(styles.buildButton, styles.builtButton)}
                  >
                    <Cpu size={14} />
                    <span>已构建</span>
                  </button>
                )}
              </div>
            )}
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
    setBuildingMessageId(messageId)
    // 展开构建日志
    setExpandedBuildLogs(prev => new Set(prev).add(messageId))
    const startTime = Date.now()
    const logs: string[] = []

    try {
      // 第一步：执行 Maven 构建
      await chatApi.executeBuildCommandStream(
        {
          command: 'mvn clean install -DskipTests',
          command_type: 'maven',
          timeout: 600  // 增加到 10 分钟，首次构建可能需要下载依赖
        },
        {
          onLog: (line: string) => {
            // 实时更新日志
            logs.push(line)
            setBuildResults(prev => ({
              ...prev,
              [messageId]: {
                success: null, // 构建中
                command: 'mvn clean install -DskipTests',
                exit_code: null,
                stdout: logs.join('\n'),
                stderr: '',
                execution_time: (Date.now() - startTime) / 1000,
                message: 'Maven 构建中...',
                phase: 'build'
              }
            }))
          },
          onComplete: (success: boolean, message: string) => {
            console.log(`构建 onComplete 触发: success=${success}, message=${message}`)
            const executionTime = (Date.now() - startTime) / 1000
            setBuildResults(prev => ({
              ...prev,
              [messageId]: {
                success,
                command: 'mvn clean install -DskipTests',
                exit_code: success ? 0 : -1,
                stdout: logs.join('\n'),
                stderr: '',
                execution_time: executionTime,
                message,
                phase: 'build'
              }
            }))

            if (success) {
              console.log('构建成功，用户可以点击"启动服务"按钮')
              setBuiltMessageIds(prev => new Set(prev).add(messageId))
            } else {
              console.error('构建失败')
            }
          },
          onError: (error: string) => {
            console.error('构建流式错误:', error)
            setBuildResults(prev => ({
              ...prev,
              [messageId]: {
                success: false,
                command: 'mvn clean install -DskipTests',
                exit_code: -1,
                stdout: logs.join('\n'),
                stderr: error,
                execution_time: (Date.now() - startTime) / 1000,
                message: `构建错误: ${error}`,
                phase: 'build'
              }
            }))
          }
        }
      )
    } catch (error) {
      console.error('构建失败:', error)
      const executionTime = (Date.now() - startTime) / 1000
      setBuildResults(prev => ({
        ...prev,
        [messageId]: {
          success: false,
          command: 'mvn clean install -DskipTests',
          exit_code: -1,
          stdout: logs.join('\n'),
          stderr: error instanceof Error ? error.message : String(error),
          execution_time: executionTime,
          message: `构建失败: ${error instanceof Error ? error.message : String(error)}`,
          phase: 'build'
        }
      }))
      throw error
    } finally {
      setBuildingMessageId(null)
    }
  }

  // 停止 Quarkus 开发服务器
  const stopQuarkusDevServer = async (messageId: string) => {
    console.log('[stopQuarkusDevServer] 停止开发服务器, messageId:', messageId)

    try {
      // 1. 先取消正在运行的流式请求
      const controller = devServerAbortControllersRef.current[messageId]
      if (controller) {
        console.log('[stopQuarkusDevServer] 取消流式请求')
        controller.abort()
        delete devServerAbortControllersRef.current[messageId]
      }

      // 2. 调用停止服务 API（不等待流式请求结束）
      console.log('[stopQuarkusDevServer] 调用停止服务 API')
      const stopResult = await chatApi.stopService(8080)
      console.log('停止服务结果:', stopResult)

      // 3. 从运行中移除
      setDevServerRunning(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })

      // 4. 更新构建结果
      setBuildResults(prev => {
        const current = prev[messageId]
        if (!current) return prev

        return {
          ...prev,
          [messageId]: {
            ...current,
            success: true,
            message: stopResult.message || '服务已停止',
            phase: 'build'
          }
        }
      })
    } catch (error) {
      console.error('停止开发服务器失败:', error)
      // 即使失败也要从运行状态移除
      setDevServerRunning(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }

  // 处理导出 Excel
  const handleExportExcel = async (messageId: string) => {
    console.log('[handleExportExcel] 导出 Excel, messageId:', messageId)

    try {
      // 使用配置中的 XML 路径
      const outputName = 'app.orm.xlsx'

      console.log('[handleExportExcel] 开始导出:', { outputName })

      // 调用 API 导出 Excel（XML 路径从后端配置读取）
      await chatApi.exportExcel(outputName)

      console.log('[handleExportExcel] 导出成功')
    } catch (error) {
      console.error('[handleExportExcel] 导出失败:', error)
      alert(`导出失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 启动 Quarkus 开发服务器
  const startQuarkusDevServer = async (messageId: string) => {
    console.log('[startQuarkusDevServer] 启动开发服务器, messageId:', messageId)
    setDevServerRunning(prev => new Set(prev).add(messageId))
    const devStartTime = Date.now()
    const devLogs: string[] = []

    // 创建 AbortController 用于取消流式请求
    const controller = new AbortController()
    devServerAbortControllersRef.current[messageId] = controller

    // 更新状态为"准备启动"
    setBuildResults(prev => {
      const current = prev[messageId]
      return {
        ...prev,
        [messageId]: {
          ...current,
          success: null,
          message: '清理端口中...',
          phase: 'dev'
        }
      }
    })

    try {
      // 先清理 8080 端口
      devLogs.push('--- 清理 8080 端口 ---')
      console.log('开始清理 8080 端口...')

      let portKillSuccess = true
      try {
        const portKillResult = await chatApi.executeBuildCommand({
          command: 'ziro kill -f 8080',
          command_type: 'custom',
          timeout: 10
        })
        console.log('端口清理结果:', portKillResult)
        if (portKillResult.stdout) {
          devLogs.push(portKillResult.stdout)
        }
        if (!portKillResult.success) {
          portKillSuccess = false
          devLogs.push(`端口清理命令返回失败: ${portKillResult.message}`)
        }
      } catch (portError) {
        console.error('端口清理错误:', portError)
        portKillSuccess = false
        devLogs.push(`端口清理异常: ${portError instanceof Error ? portError.message : String(portError)}`)
      }

      devLogs.push('端口清理完成，准备启动 Quarkus...')

      // 更新状态并显示端口清理日志
      setBuildResults(prev => {
        const current = prev[messageId]
        return {
          ...prev,
          [messageId]: {
            ...current,
            success: null,
            message: 'Quarkus 项目启动中...',
            phase: 'dev',
            stdout: devLogs.join('\n')
          }
        }
      })

      console.log('开始启动 Quarkus 开发服务器...')
      devLogs.push('--- Quarkus 开发服务器 ---')

      // 启动流式执行 Quarkus 开发服务器（多模块项目）
      await chatApi.executeBuildCommandStream(
        {
          command: 'mvn -pl labor-tracking-app -am io.quarkus:quarkus-maven-plugin:dev',
          command_type: 'maven',
          timeout: 3600  // 1小时超时
        },
        {
          onLog: (line: string) => {
            devLogs.push(line)
            // 更新开发服务器日志
            setBuildResults(prev => {
              const current = prev[messageId]
              return {
                ...prev,
                [messageId]: {
                  ...current,
                  stdout: devLogs.join('\n')
                }
              }
            })
          },
          onComplete: (success: boolean, message: string) => {
            // 清理 AbortController
            delete devServerAbortControllersRef.current[messageId]

            setDevServerRunning(prev => {
              const next = new Set(prev)
              next.delete(messageId)
              return next
            })
          },
          onError: (error: string) => {
            console.error('Quarkus 开发服务器错误:', error)
            // 清理 AbortController
            delete devServerAbortControllersRef.current[messageId]

            setDevServerRunning(prev => {
              const next = new Set(prev)
              next.delete(messageId)
              return next
            })
          }
        },
        controller.signal
      )
    } catch (error) {
      console.error('启动开发服务器失败:', error)
      // 清理 AbortController
      delete devServerAbortControllersRef.current[messageId]

      setDevServerRunning(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
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
                      {buildResults[message.id] && (
                        <div className={styles.buildResult}>
                          <div className={clsx(
                            styles.buildStatus,
                            buildResults[message.id].success === true ? styles.success :
                            buildResults[message.id].success === false ? styles.error :
                            styles.building
                          )}>
                            {/* 智能状态显示 */}
                            {(() => {
                              const result = buildResults[message.id]

                              // 开发服务器运行中
                              if (devServerRunning.has(message.id) && result.phase === 'dev') {
                                return '🔥 开发服务器运行中'
                              }

                              // 标准状态
                              if (result.success === true) return '✓ 构建成功'
                              if (result.success === false) return '✗ 构建失败'
                              if (result.phase === 'dev') return '⟳ 项目启动中...'
                              return '⟳ 构建中...'
                            })()}
                            <span className={styles.executionTime}>
                              ({buildResults[message.id].execution_time.toFixed(2)}s)
                            </span>
                          </div>
                          <details
                            className={styles.buildDetails}
                            open={expandedBuildLogs.has(message.id) || devServerRunning.has(message.id)}
                            onToggle={(e) => {
                              const isOpen = (e.target as HTMLDetailsElement).open
                              setExpandedBuildLogs(prev => {
                                const next = new Set(prev)
                                if (isOpen) {
                                  next.add(message.id)
                                } else {
                                  next.delete(message.id)
                                }
                                return next
                              })
                            }}
                          >
                            <summary>{buildResults[message.id].phase === 'dev' ? '开发服务器日志' : '构建日志'}</summary>
                            <pre
                              ref={(el) => {
                                // 自动滚动到底部（构建中或开发服务器运行中）
                                if (el && (buildingMessageId === message.id || devServerRunning.has(message.id))) {
                                  requestAnimationFrame(() => {
                                    if (el) {
                                      el.scrollTop = el.scrollHeight
                                    }
                                  })
                                }
                              }}
                              className={styles.buildLog}
                            >
                              {buildResults[message.id].stdout || buildResults[message.id].stderr}
                            </pre>
                          </details>
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
