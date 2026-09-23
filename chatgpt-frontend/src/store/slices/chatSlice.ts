import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Message, ChatMode, CSVFile } from '../../types'

interface ChatState {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  currentQuery: string
  error: string | null
  mode: ChatMode
  selectedFileId: string | null
  csvFiles: CSVFile[]
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  isStreaming: false,
  currentQuery: '',
  error: null,
  mode: 'pinecone',
  selectedFileId: null,
  csvFiles: [],
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload)
    },
    updateMessage: (state, action: PayloadAction<Message>) => {
      const index = state.messages.findIndex(msg => msg.id === action.payload.id)
      if (index !== -1) {
        state.messages[index] = action.payload
      } else {
        state.messages.push(action.payload)
      }
    },
    updateLastMessage: (state, action: PayloadAction<string>) => {
      if (state.messages.length > 0) {
        const lastMessage = state.messages[state.messages.length - 1]
        if (lastMessage.role === 'assistant') {
          lastMessage.content += action.payload
        }
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setStreaming: (state, action: PayloadAction<boolean>) => {
      state.isStreaming = action.payload
    },
    setCurrentQuery: (state, action: PayloadAction<string>) => {
      state.currentQuery = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    clearChat: (state) => {
      state.messages = []
      state.currentQuery = ''
      state.error = null
    },
    setMode: (state, action: PayloadAction<ChatMode>) => {
      state.mode = action.payload
      // Clear selected file when switching to pinecone mode
      if (action.payload === 'pinecone') {
        state.selectedFileId = null
      }
    },
    setSelectedFileId: (state, action: PayloadAction<string | null>) => {
      state.selectedFileId = action.payload
    },
    setCsvFiles: (state, action: PayloadAction<CSVFile[]>) => {
      state.csvFiles = action.payload
    },
  },
})

export const {
  setMessages,
  addMessage,
  updateMessage,
  updateLastMessage,
  setLoading,
  setStreaming,
  setCurrentQuery,
  setError,
  clearChat,
  setMode,
  setSelectedFileId,
  setCsvFiles,
} = chatSlice.actions

export default chatSlice.reducer
