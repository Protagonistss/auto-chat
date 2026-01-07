// API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// 导入 SSE 相关类型
import type {
  SSECallbacks,
  SSEContentData,
  SSEEndData,
  SSEErrorEvent,
  SSEEventType,
  SSEStartData,
  StreamMessageOptions,
} from '@/types/chat'

// API 响应类型
export interface CreateConversationResponse {
  conversation_id: string
  title: string
}

export interface FileUploadResponse {
  file_id: string
  original_name: string
  file_size: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ConversationFile {
  id: string
  original_name: string
  file_size: number
  upload_time: number
}

export interface ConversationDetail {
  conversation_id: string
  title: string
  created_at: number
  messages: ConversationMessage[]
  files: ConversationFile[]
}

export interface Conversation {
  id: string
  title: string
  created_at: number
  message_count: number
}

// 请求类型
export interface CreateConversationRequest {
  title?: string
}

export interface SendMessageRequest {
  message: string
  file_ids?: string[]
}

// 构建命令类型
export interface BuildCommandRequest {
  command: string
  cwd?: string
  timeout?: number
  command_type?: string
}

export interface BuildCommandResponse {
  success: boolean | null  // null = 构建中, true = 成功, false = 失败
  command: string
  exit_code: number | null
  stdout: string
  stderr: string
  execution_time: number
  message: string
  phase?: 'build' | 'dev'  // build = 构建阶段, dev = 开发服务器启动阶段
}

/**
 * API 客户端类
 */
class ChatApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  /**
   * 创建新会话
   */
  async createConversation(title?: string): Promise<CreateConversationResponse> {
    const response = await fetch(`${this.baseUrl}/conversations/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    })

    if (!response.ok) {
      throw new Error(`创建会话失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 上传文件到会话
   */
  async uploadFile(conversationId: string, file: File): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('files', file)

    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`上传文件失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 发送消息（异步）
   */
  async sendMessage(
    conversationId: string,
    message: string,
    fileIds?: string[]
  ): Promise<MessageTaskSubmitResponse> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        file_ids: fileIds,
      }),
    })

    if (!response.ok) {
      throw new Error(`发送消息失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 发送消息（SSE 流式响应）
   */
  async sendMessageStream(
    conversationId: string,
    message: string,
    fileIds: string[] | undefined,
    options: StreamMessageOptions,
    enableThinking: boolean = false
  ): Promise<string> {
    const { signal, callbacks } = options

    const requestBody = {
      message,
      file_ids: fileIds,
      enable_thinking: enableThinking,
    }

    // 调试日志
    console.log('发送请求:', { enableThinking, requestBody })

    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })

    if (!response.ok) {
      throw new Error(`发送消息失败: ${response.statusText}`)
    }

    // 验证响应类型是 SSE
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('text/event-stream')) {
      throw new Error('服务器不支持流式响应')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let messageId = ''

    try {
      while (true) {
        // 检查是否被中止
        if (signal?.aborted) {
          reader.cancel()
          throw new Error('请求已取消')
        }

        const { done, value } = await reader.read()

        if (done) break

        // 解码并追加到缓冲区
        buffer += decoder.decode(value, { stream: true })

        // 按行处理 SSE 数据
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留未完成的行

        let currentEvent: SSEEventType | null = null
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim() as SSEEventType
          } else if (line.startsWith('data: ')) {
            currentData = line.substring(6)
          } else if (line === '') {
            // 空行表示事件结束
            if (currentData) {
              // 如果没有 event 类型，默认为 'data'
              const eventType = currentEvent || 'data'
              this.handleSSEEvent(eventType, currentData, callbacks)
              if (eventType === 'start' || eventType === 'end') {
                try {
                  const data = JSON.parse(currentData)
                  if (data.message_id) messageId = data.message_id
                } catch {
                  // 忽略解析错误
                }
              }
            }
            currentEvent = null
            currentData = ''
          }
        }
      }

      return messageId
    } catch (error) {
      // 处理中止错误
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onError?.('请求已取消')
        throw error
      }
      throw error
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 处理 SSE 事件
   */
  private handleSSEEvent(type: SSEEventType, data: string, callbacks: SSECallbacks): void {
    try {
      switch (type) {
        case 'start':
          console.log('SSE start:', data)
          callbacks.onStart?.(JSON.parse(data) as SSEStartData)
          break
        case 'data':
          const parsed = JSON.parse<SSEContentData>(data)
          // 调试日志 - 显示完整的 thinking 值
          console.log('SSE data:', {
            content: parsed.content.substring(0, 100),
            thinking: parsed.thinking,
            thinkingType: typeof parsed.thinking
          })
          callbacks.onChunk?.(parsed.content, parsed.thinking)
          break
        case 'end':
          console.log('SSE end:', data)
          callbacks.onEnd?.(JSON.parse(data) as SSEEndData)
          break
        case 'error':
          const errorData = JSON.parse<{ error: string }>(data)
          callbacks.onError?.(errorData.error)
          break
      }
    } catch (error) {
      console.error('解析 SSE 事件失败:', error)
      callbacks.onError?.('解析响应数据失败')
    }
  }

  /**
   * 获取会话详情
   */
  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`)

    if (!response.ok) {
      throw new Error(`获取会话失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 列出所有会话
   */
  async listConversations(): Promise<Conversation[]> {
    const response = await fetch(`${this.baseUrl}/conversations/`)

    if (!response.ok) {
      throw new Error(`获取会话列表失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 删除会话
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/conversations/${conversationId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error(`删除会话失败: ${response.statusText}`)
    }
  }

  /**
   * 提交构建任务（上传 XML 内容）
   */
  async submitBuildTask(xmlContent: string): Promise<string> {
    // 将 XML 内容转换为 Blob
    const blob = new Blob([xmlContent], { type: 'application/json' })
    const formData = new FormData()
    formData.append('file', blob, 'orm.xml')

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`提交构建任务失败: ${response.statusText}`)
    }

    const result = await response.json()
    return result.task_id
  }

  /**
   * 获取构建任务状态
   */
  async getBuildTask(taskId: string): Promise<{
    task_id: string
    status: 'pending' | 'processing' | 'success' | 'failed'
    result?: any
    error?: string
  }> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error(`查询构建任务失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 轮询构建任务直到完成
   */
  async pollBuildTask(
    taskId: string,
    options: {
      interval?: number
      maxAttempts?: number
      onProgress?: (task: any) => void
    } = {}
  ): Promise<any> {
    const { interval = 1000, maxAttempts = 60, onProgress } = options

    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.getBuildTask(taskId)

      if (onProgress) {
        onProgress(task)
      }

      if (task.status === 'success') {
        return task
      }

      if (task.status === 'failed') {
        throw new Error(task.error || '构建任务失败')
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    throw new Error('构建任务超时')
  }

  /**
   * 写入 ORM Entity 到 app.orm.xml
   */
  async writeOrmEntity(
    xmlContent: string,
    options: {
      source?: 'ai' | 'chat' | 'manual'
      taskId?: string
    } = {}
  ): Promise<{
    success: boolean
    entity_name: string
    action: 'created' | 'updated'
    message: string
  }> {
    const { source = 'chat', taskId } = options

    const response = await fetch(`${this.baseUrl}/orm/entity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        xml: xmlContent,
        source,
        task_id: taskId,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '写入 ORM Entity 失败' }))
      throw new Error(error.detail || `写入 ORM Entity 失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 检测 XML 类型
   */
  detectXmlType(xmlContent: string): string | null {
    // 移除代码块标记
    const cleaned = xmlContent.replace(/```xml\n?/g, '').replace(/```\n?/g, '').trim()

    // 检测 entity 标签 -> orm（放宽条件，只要检测到 entity 标签即可）
    if (/<entity\b/.test(cleaned)) return 'orm'

    // 检测 setting 标签 -> config
    if (/<setting\b/.test(cleaned)) return 'config'

    // 检测 endpoint 标签 -> api
    if (/<endpoint\b/.test(cleaned)) return 'api'

    return null
  }

  /**
   * 统一的 XML 构建方法
   */
  async buildXml(
    xmlContent: string,
    options: {
      xmlType?: string
      source?: 'ai' | 'chat' | 'manual'
      taskId?: string
    } = {}
  ): Promise<{
    success: boolean
    xml_type: string
    identifier: string
    action: 'created' | 'updated'
    display_name: string
    message: string
  }> {
    const { xmlType, source = 'chat', taskId } = options

    // 自动检测类型（如果未指定）
    const detectedType = xmlType || this.detectXmlType(xmlContent)

    if (!detectedType) {
      throw new Error('无法识别 XML 类型，请检查 XML 格式')
    }

    const response = await fetch(`${this.baseUrl}/xml/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        xml_type: detectedType,
        xml: xmlContent,
        source,
        task_id: taskId,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'XML 构建失败' }))
      throw new Error(error.detail || `XML 构建失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 获取支持的 XML 类型列表
   */
  async getXmlTypes(): Promise<{
    types: Array<{
      type: string
      name: string
      display_name: string
      element_tag: string
      description: string
    }>
  }> {
    const response = await fetch(`${this.baseUrl}/xml/types`)

    if (!response.ok) {
      throw new Error(`获取 XML 类型失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 停止运行中的服务
   */
  async stopService(port: number = 8080): Promise<{
    success: boolean
    message: string
  }> {
    const response = await fetch(`${this.baseUrl}/build/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ port }),
    })

    if (!response.ok) {
      throw new Error(`停止服务失败: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * 导出 Excel
   */
  async exportExcel(outputName: string = 'app.orm.xlsx'): Promise<void> {
    const response = await fetch(`${this.baseUrl}/build/export/excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        output_name: outputName
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || `导出 Excel 失败: ${response.statusText}`)
    }

    // 检查响应是否是文件下载
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('spreadsheetml')) {
      // 下载文件
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = outputName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } else {
      // JSON 响应
      const data = await response.json()
      console.log('导出结果:', data)
    }
  }

  /**
   * 执行构建命令
   */
  async executeBuildCommand(request: BuildCommandRequest): Promise<BuildCommandResponse> {
    console.log('发送构建请求:', request)

    // 创建 AbortController 用于超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), (request.timeout || 300) * 1000 + 5000)

    try {
      const response = await fetch(`${this.baseUrl}/build/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      console.log('构建响应状态:', response.status)

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '执行构建命令失败' }))
        console.error('构建请求失败:', error)
        throw new Error(error.detail || `执行构建命令失败: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('构建响应结果:', result)
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      console.error('构建请求异常:', error)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求超时')
      }
      throw error
    }
  }

  /**
   * 流式执行构建命令 (SSE)
   */
  async executeBuildCommandStream(
    request: BuildCommandRequest,
    callbacks: {
      onLog: (line: string) => void
      onComplete: (success: boolean, message: string) => void
      onError: (error: string) => void
    },
    signal?: AbortSignal
  ): Promise<void> {
    console.log('开始流式构建请求:', request)

    const response = await fetch(`${this.baseUrl}/build/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '执行构建命令失败' }))
      throw new Error(error.detail || `执行构建命令失败: ${response.statusText}`)
    }

    console.log('流式响应已建立，开始读取...')

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法读取响应流')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let logCount = 0

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          console.log(`流式响应结束，共接收 ${logCount} 条日志`)
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // 按行处理 SSE 数据
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6)

            try {
              const event = JSON.parse(data)

              if (event.type === 'log') {
                logCount++
                callbacks.onLog(event.line)
              } else if (event.type === 'complete') {
                console.log(`收到 complete 事件: success=${event.success}, message=${event.message}`)
                callbacks.onComplete(event.success, event.message)
                return
              }
            } catch (e) {
              console.error('解析 SSE 事件失败:', e, 'data:', data)
            }
          }
        }
      }
    } catch (error) {
      console.error('流式请求异常:', error)
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onError('请求已取消')
        throw error
      }
      throw error
    } finally {
      reader.releaseLock()
    }
  }
}

// 导出单例实例
export const chatApi = new ChatApiClient()

// 导出类以便自定义配置
export { ChatApiClient }
