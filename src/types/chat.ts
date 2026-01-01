export interface Attachment {
  id: string
  name: string
  size: number
  type: string
  url?: string
  file?: File
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  attachments?: Attachment[]
  loading?: boolean
  statusText?: string
  // 思考模式相关
  thinkingContent?: string
  thinkingExpanded?: boolean
}

export interface ChatConfig {
  placeholder?: string
  disabled?: boolean
  onSendMessage?: (message: string, attachments?: Attachment[]) => void | Promise<void>
}

// SSE 事件类型
export type SSEEventType = 'start' | 'data' | 'end' | 'error'

// SSE 数据结构
export interface SSEStartData {
  message_id: string
}

export interface SSEContentData {
  content: string
  thinking?: boolean
}

export interface SSEEndData {
  message_id: string
}

export interface SSEErrorData {
  error: string
}

// SSE 流式回调
export interface SSECallbacks {
  onStart?: (data: SSEStartData) => void
  onChunk?: (chunk: string, thinking?: boolean) => void
  onEnd?: (data: SSEEndData) => void
  onError?: (error: string) => void
}

// 流式发送选项
export interface StreamMessageOptions {
  signal?: AbortSignal
  callbacks: SSECallbacks
}
