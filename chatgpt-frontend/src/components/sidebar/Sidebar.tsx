import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { setCurrentConversationId, deleteConversation as deleteConversationAction, updateConversation } from '../../store/slices/conversationSlice'
import { clearChat } from '../../store/slices/chatSlice'
import { Plus, MessageSquare, Settings, Menu, X, Upload, Home, Trash2, MoreVertical, Edit2, Check, XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { apiService } from '../../services/api'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  currentPage: string
  onPageChange: (page: string) => void
}

const Sidebar = ({ isOpen, onToggle, currentPage, onPageChange }: SidebarProps) => {
  const dispatch = useDispatch()
  const { conversations, currentConversationId } = useSelector((state: RootState) => state.conversations)
  const [isCreating, setIsCreating] = useState(false)
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(null)
  const [editingConversation, setEditingConversation] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const handleNewChat = () => {
    dispatch(clearChat())
    dispatch(setCurrentConversationId(null))
    setIsCreating(false)
    onPageChange('chat') // Navigate to chat page
  }

  const handleSelectConversation = (conversationId: string) => {
    dispatch(setCurrentConversationId(conversationId))
    setIsCreating(false)
    onPageChange('chat') // Navigate to chat page
  }

  const handleDeleteConversation = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation() // Prevent selecting the conversation
    try {
      await apiService.deleteConversation(conversationId)
      dispatch(deleteConversationAction(conversationId))
      if (currentConversationId === conversationId) {
        dispatch(clearChat())
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const handleStartEdit = (e: React.MouseEvent, conversationId: string, currentTitle: string) => {
    e.stopPropagation()
    setEditingConversation(conversationId)
    setEditTitle(currentTitle)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const handleSaveEdit = async (conversationId: string) => {
    if (editTitle.trim() && editTitle.trim() !== '') {
      try {
        await apiService.updateConversation(conversationId, { title: editTitle.trim() })
        dispatch(updateConversation({ id: conversationId, title: editTitle.trim() }))
        setEditingConversation(null)
      } catch (error) {
        console.error('Failed to update conversation:', error)
      }
    } else {
      handleCancelEdit()
    }
  }

  const handleCancelEdit = () => {
    setEditingConversation(null)
    setEditTitle('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(conversationId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <div className={cn(
      "flex flex-col h-full bg-gray-50 border-r border-gray-200 transition-all duration-300",
      isOpen ? "w-64" : "w-0 overflow-hidden"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">MuazAshraf Services</h2>
        <button
          onClick={onToggle}
          className="p-1 rounded-md hover:bg-gray-200 transition-colors"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="p-2 space-y-1">
        <button
          onClick={() => onPageChange('home')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors",
            currentPage === 'home'
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700"
          )}
        >
          <Home className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Home</span>
        </button>

        <button
          onClick={() => onPageChange('upload')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors",
            currentPage === 'upload'
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700"
          )}
        >
          <Upload className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Upload</span>
        </button>

        <button
          onClick={() => onPageChange('chat')}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors",
            currentPage === 'chat'
              ? "bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 text-gray-700"
          )}
        >
          <MessageSquare className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">Chat</span>
        </button>
      </div>

      {/* New Chat Button - Only show on Chat page */}
      {currentPage === 'chat' && (
        <div className="p-4">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {currentPage === 'chat' && (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
                Recent Chats
              </div>
              <div className="space-y-1">
                {conversations.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No conversations yet
                  </div>
                ) : (
                  conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className="relative group"
                      onMouseEnter={() => setHoveredConversation(conversation.id)}
                      onMouseLeave={() => setHoveredConversation(null)}
                    >
                      <button
                        onClick={() => handleSelectConversation(conversation.id)}
                        className={cn(
                          "w-full flex items-start gap-3 px-3 py-2 text-left rounded-lg transition-colors",
                          currentConversationId === conversation.id
                            ? "bg-blue-100 text-blue-900"
                            : "hover:bg-gray-100 text-gray-700"
                        )}
                      >
                        <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          {editingConversation === conversation.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => handleEditKeyDown(e, conversation.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-1 px-1 py-0 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSaveEdit(conversation.id)
                                }}
                                className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancelEdit()
                                }}
                                className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                              >
                                <XCircle className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="truncate text-sm block">
                                {conversation.title}
                              </span>
                              {conversation.namespace && (
                                <span className="text-xs text-gray-500 truncate block">
                                  {conversation.namespace}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {hoveredConversation === conversation.id && editingConversation !== conversation.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => handleStartEdit(e, conversation.id, conversation.title)}
                              className="p-1 rounded hover:bg-gray-200 transition-colors"
                              title="Edit name"
                            >
                              <Edit2 className="w-3 h-3 text-gray-500 hover:text-blue-500" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteConversation(e, conversation.id)}
                              className="p-1 rounded hover:bg-gray-200 transition-colors"
                              title="Delete conversation"
                            >
                              <Trash2 className="w-3 h-3 text-gray-500 hover:text-red-500" />
                            </button>
                          </div>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  )
}

export default Sidebar
