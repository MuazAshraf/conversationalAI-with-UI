import { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { addMessage, updateMessage, setLoading, setStreaming, setError, setMessages } from '../../store/slices/chatSlice'
import { addConversation, updateConversation, setCurrentConversationId } from '../../store/slices/conversationSlice'
import { apiService } from '../../services/api'
import { Message, Conversation, Namespace, Citation } from '../../types'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import { Send, Loader2, ChevronDown, Globe } from 'lucide-react'

const ChatInterface = () => {
  const dispatch = useDispatch()
  const { messages, isLoading, isStreaming, error } = useSelector((state: RootState) => state.chat)
  const { currentConversationId } = useSelector((state: RootState) => state.conversations)
  const [inputValue, setInputValue] = useState('')
  const [enableStreaming, setEnableStreaming] = useState(false) // Toggle for streaming - disabled by default
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default_namespace')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [showNamespaceDropdown, setShowNamespaceDropdown] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Load conversation messages and namespace when conversation changes
  useEffect(() => {
    const loadConversationMessages = async () => {
      if (currentConversationId) {
        try {
          const response = await apiService.getConversation(currentConversationId)
          if (response.data) {
            // Load messages
            const messages = response.data.messages.map((msg: any) => ({
              id: msg.id || Date.now().toString(),
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp
            }))
            dispatch(setMessages(messages))

            // Set namespace from conversation
            if (response.data.namespace) {
              setSelectedNamespace(response.data.namespace)
            }
          }
        } catch (error) {
          console.error('Failed to load conversation:', error)
        }
      } else {
        dispatch(setMessages([]))
      }
    }
    loadConversationMessages()
  }, [currentConversationId, dispatch])

  // Load namespaces on mount and periodically
  useEffect(() => {
    const loadNamespaces = async () => {
      try {
        const response = await apiService.getNamespaces()
        const namespaceList = response.data.namespaces || []
        setNamespaces(namespaceList)

        // If no namespaces exist yet, keep default_namespace
        if (namespaceList.length === 0) {
          setNamespaces(['default_namespace'])
          if (!currentConversationId) {
            setSelectedNamespace('default_namespace')
          }
        } else {
          // Set first namespace as default if current one doesn't exist
          if (!currentConversationId && !namespaceList.includes(selectedNamespace)) {
            setSelectedNamespace(namespaceList[0])
          }
        }
      } catch (error) {
        console.error('Failed to load namespaces:', error)
        // On error, ensure at least default namespace is available
        setNamespaces(['default_namespace'])
      }
    }

    loadNamespaces()
    // Reload namespaces every 30 seconds to catch new ones
    const interval = setInterval(loadNamespaces, 30000)

    return () => clearInterval(interval)
  }, [currentConversationId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNamespaceDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    console.log('=== FRONTEND CHAT DEBUG ===')
    console.log('Selected Namespace:', selectedNamespace)
    console.log('Current Conversation ID:', currentConversationId)
    console.log('User Question:', inputValue.trim())

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    }

    // Create new conversation if needed with current namespace
    let conversationId = currentConversationId
    if (!conversationId) {
      console.log('Creating new conversation with namespace:', selectedNamespace)
      try {
        const response = await apiService.createConversation({
          title: inputValue.trim().substring(0, 50) + (inputValue.trim().length > 50 ? '...' : ''),
          namespace: selectedNamespace
        })
        conversationId = response.data.id
        console.log('New conversation created:', conversationId, 'with namespace:', response.data.namespace)
        dispatch(setCurrentConversationId(conversationId))
        dispatch(addConversation(response.data))
      } catch (error) {
        console.error('Failed to create conversation:', error)
      }
    } else {
      console.log('Using existing conversation:', conversationId)
    }

    dispatch(addMessage(userMessage))
    dispatch(setLoading(true))
    dispatch(setError(null))
    setInputValue('')

    try {
      if (enableStreaming) {
        // Streaming implementation
        dispatch(setStreaming(true))

        const eventSource = apiService.stream({
          query: inputValue.trim(),
          thread_id: conversationId || undefined,
        })

        eventSourceRef.current = eventSource

        let streamedContent = ''
        const assistantMessageId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
        }

        let messageAdded = false

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.type === 'token') {
              streamedContent += data.content
              if (!messageAdded) {
                dispatch(addMessage({ ...assistantMessage, content: streamedContent }))
                messageAdded = true
              } else {
                // Update the existing message
                dispatch(updateMessage({ ...assistantMessage, content: streamedContent }))
              }
            } else if (data.type === 'complete') {
              eventSource.close()
              eventSourceRef.current = null
              dispatch(setLoading(false))
              dispatch(setStreaming(false))
            } else if (data.type === 'error') {
              eventSource.close()
              eventSourceRef.current = null
              dispatch(setError(data.message || 'Stream error'))
              dispatch(setLoading(false))
              dispatch(setStreaming(false))
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e)
          }
        }

        eventSource.onerror = (error) => {
          console.error('SSE error:', error)
          eventSource.close()
          eventSourceRef.current = null
          dispatch(setError('Connection error'))
          dispatch(setLoading(false))
          dispatch(setStreaming(false))
        }
      } else {
        // Regular non-streaming request with namespace using /ask endpoint
        console.log('Sending to backend /ask:')
        console.log('  - Namespace:', selectedNamespace)
        console.log('  - Thread ID:', conversationId || 'default')
        console.log('  - Question:', userMessage.content)

        const response = await apiService.ask({
          namespace: selectedNamespace,
          thread_id: conversationId || 'default',
          messages: [{ question: userMessage.content }]
        })

        console.log('Response from backend:', response.data)
        console.log('Backend used namespace:', response.data.namespace_used)
        console.log('Citations received:', response.data.citations)

        const assistantMessage: Message & { citations?: Citation[] } = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.response || response.data.output || 'No response received',
          timestamp: new Date().toISOString(),
          sources: response.data.sources || [],  // Include sources from response if available
          citations: response.data.citations || []  // Include citations with scores
        }

        dispatch(addMessage(assistantMessage))
      }
    } catch (error: any) {
      console.error('Chat error:', error)
      dispatch(setError(error.message || 'Failed to send message'))
    } finally {
      dispatch(setLoading(false))
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            {currentConversationId ? "Conversation" : "New Chat"}
          </h1>

          {/* Namespace Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => !currentConversationId && setShowNamespaceDropdown(!showNamespaceDropdown)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                currentConversationId
                  ? 'bg-gray-50 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-100 hover:bg-gray-200 cursor-pointer'
              }`}
              title={currentConversationId ? "Namespace is locked during active conversation" : "Select namespace"}
            >
              <span className="text-gray-700">Namespace:</span>
              <span className="font-medium">{selectedNamespace}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showNamespaceDropdown ? 'rotate-180' : ''}`} />
              {currentConversationId && (
                <span className="text-xs text-gray-400 ml-1">(locked)</span>
              )}
            </button>

            {showNamespaceDropdown && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="py-1">
                  {namespaces.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      No namespaces available
                    </div>
                  ) : (
                    namespaces.map((namespace) => (
                      <button
                        key={namespace}
                        onClick={() => {
                          console.log('User selected namespace:', namespace)
                          setSelectedNamespace(namespace)
                          setShowNamespaceDropdown(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
                          selectedNamespace === namespace ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {namespace}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Streaming toggle hidden for now */}
          {/* <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableStreaming}
              onChange={(e) => setEnableStreaming(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Enable Streaming</span>
          </label> */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking...
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} isLoading={isLoading} />
        {error && (
          <div className="p-4 text-center text-red-600 bg-red-50 border-t border-red-200">
            Error: {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSendMessage}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
      </div>
    </div>
  )
}

export default ChatInterface
