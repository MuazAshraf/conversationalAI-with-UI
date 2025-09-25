export interface Citation {
  score: number
  title: string
  chunk: string
  page: string | number
  tags: string[]
  source: string
  preview: string
}

export interface Source {
  id: string
  content_preview: string
  metadata?: any
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: Source[]
  citations?: Citation[]
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  messages?: Message[]
}

export interface QueryResponse {
  answer: string
  performance: {
    total_time_seconds: number
    total_time_human: string
    step_timings: Record<string, number>
    step_order: string[]
    slowest_step: [string, number]
    fastest_step: [string, number]
  }
  metadata: {
    thread_id: string
    processing_method: string
    workflow_type: string
  }
}

export interface StreamingEvent {
  type: 'start' | 'token' | 'step_start' | 'step_end' | 'complete'
  content?: string
  step?: string
  timestamp: number
}

export interface ApiError {
  error: string
  message?: string
}

export interface Namespace {
  id: string
  name: string
  document_count: number
  created_at: string
  updated_at: string
}

export interface UploadResponse {
  message: string
  uploaded_files: string[]
  namespace: string
  total_documents: number
}
