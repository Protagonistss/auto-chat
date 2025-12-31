export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatConfig {
  placeholder?: string
  disabled?: boolean
  onSendMessage?: (message: string) => void | Promise<void>
}
