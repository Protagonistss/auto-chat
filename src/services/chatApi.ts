// API 基础 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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

export interface MessageTaskSubmitResponse {
  task_id: string
}

export interface MessageTask {
  task_id: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  result_message?: {
    id: string
    role: 'assistant'
    content: string
    created_at: string
  }
  error_message?: string
  created_at: string
  completed_at?: string
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
   * 查询消息任务状态
   */
  async getMessageTask(taskId: string): Promise<MessageTask> {
    const response = await fetch(`${this.baseUrl}/conversations/tasks/${taskId}`)

    if (!response.ok) {
      throw new Error(`查询任务失败: ${response.statusText}`)
    }

    return response.json()
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
   * 轮询任务直到完成
   */
  async pollTask(
    taskId: string,
    options: {
      interval?: number
      maxAttempts?: number
      onProgress?: (task: MessageTask) => void
    } = {}
  ): Promise<MessageTask> {
    const { interval = 1000, maxAttempts = 60, onProgress } = options

    for (let i = 0; i < maxAttempts; i++) {
      const task = await this.getMessageTask(taskId)

      if (onProgress) {
        onProgress(task)
      }

      if (task.status === 'success') {
        return task
      }

      if (task.status === 'failed') {
        throw new Error(task.error_message || '任务处理失败')
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    throw new Error('任务处理超时')
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
}

// 导出单例实例
export const chatApi = new ChatApiClient()

// 导出类以便自定义配置
export { ChatApiClient }
