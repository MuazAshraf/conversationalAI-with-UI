import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { Conversation } from '../../types'

interface ConversationState {
  conversations: Conversation[]
  currentConversationId: string | null
  isLoading: boolean
  error: string | null
}

const initialState: ConversationState = {
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  error: null,
}

const conversationSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload
    },
    addConversation: (state, action: PayloadAction<Conversation>) => {
      state.conversations.unshift(action.payload)
    },
    updateConversation: (state, action: PayloadAction<Conversation>) => {
      const index = state.conversations.findIndex(conv => conv.id === action.payload.id)
      if (index !== -1) {
        state.conversations[index] = action.payload
      }
    },
    deleteConversation: (state, action: PayloadAction<string>) => {
      state.conversations = state.conversations.filter(conv => conv.id !== action.payload)
      if (state.currentConversationId === action.payload) {
        state.currentConversationId = null
      }
    },
    setCurrentConversationId: (state, action: PayloadAction<string | null>) => {
      state.currentConversationId = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
  },
})

export const {
  setConversations,
  addConversation,
  updateConversation,
  deleteConversation,
  setCurrentConversationId,
  setLoading,
  setError,
} = conversationSlice.actions

export default conversationSlice.reducer
