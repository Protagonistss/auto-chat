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
}

export interface ChatConfig {
  placeholder?: string
  disabled?: boolean
  onSendMessage?: (message: string, attachments?: Attachment[]) => void | Promise<void>
}
