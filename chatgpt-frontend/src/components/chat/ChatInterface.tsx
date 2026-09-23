import { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { addMessage, updateMessage, setLoading, setStreaming, setError, setMessages, setMode, setSelectedFileId, setCsvFiles } from '../../store/slices/chatSlice'
import { addConversation, updateConversation, setCurrentConversationId } from '../../store/slices/conversationSlice'
import { apiService } from '../../services/api'
import { Message, Conversation, Namespace, Citation, CSVFile } from '../../types'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import { Send, Loader2, ChevronDown, Globe, FileSpreadsheet, Headphones, WandSparkles } from 'lucide-react'

const ChatInterface = () => {
  const dispatch = useDispatch()
  const { messages, isLoading, isStreaming, error, mode, selectedFileId, csvFiles } = useSelector((state: RootState) => state.chat)
  const { currentConversationId } = useSelector((state: RootState) => state.conversations)
  const [inputValue, setInputValue] = useState('')
  const [enableStreaming, setEnableStreaming] = useState(false) // Toggle for streaming - disabled by default
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default_namespace')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [showNamespaceDropdown, setShowNamespaceDropdown] = useState(false)
  const [showCsvDropdown, setShowCsvDropdown] = useState(false)
  const [customerSupportEnabled, setCustomerSupportEnabled] = useState(false)
  const [contentOptimizerEnabled, setContentOptimizerEnabled] = useState(false)
  const [optimizerAttachment, setOptimizerAttachment] = useState<File | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const skipNextConversationLoadRef = useRef(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const csvDropdownRef = useRef<HTMLDivElement>(null)

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
        // A newly created conversation is still empty on the server until /ask
        // finishes. Keep the optimistic user message instead of replacing it
        // with that temporary empty response.
        if (skipNextConversationLoadRef.current) {
          skipNextConversationLoadRef.current = false
          return
        }
        try {
          const response = await apiService.getConversation(currentConversationId)
          if (response.data) {
            // Load messages
            const messages = response.data.messages.map((msg: any) => ({
              id: msg.id || Date.now().toString(),
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
              citations: msg.citations || [],
              toolsUsed: msg.tools_used || [],
              evaluation: msg.evaluation || undefined,
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

  // Load CSV files on mount
  useEffect(() => {
    const loadCsvFiles = async () => {
      try {
        const response = await apiService.getCsvFiles()
        dispatch(setCsvFiles(response.data.files || []))
      } catch (error) {
        console.error('Failed to load CSV files:', error)
      }
    }
    loadCsvFiles()
  }, [dispatch])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNamespaceDropdown(false)
      }
      if (csvDropdownRef.current && !csvDropdownRef.current.contains(event.target as Node)) {
        setShowCsvDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && !optimizerAttachment) || isLoading) return

    const submittedMessage = inputValue.trim() || 'Optimize the attached document.'

    console.log('=== FRONTEND CHAT DEBUG ===')
    console.log('Selected Namespace:', selectedNamespace)
    console.log('Current Conversation ID:', currentConversationId)
    console.log('User Question:', submittedMessage)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: optimizerAttachment
        ? `${submittedMessage}\n\n📎 ${optimizerAttachment.name}`
        : submittedMessage,
      timestamp: new Date().toISOString(),
    }

    // Create new conversation if needed with current namespace
    let conversationId = currentConversationId
    if (!conversationId) {
      console.log('Creating new conversation with namespace:', selectedNamespace)
      try {
        const response = await apiService.createConversation({
          title: submittedMessage.substring(0, 50) + (submittedMessage.length > 50 ? '...' : ''),
          namespace: selectedNamespace
        })
        conversationId = response.data.id
        console.log('New conversation created:', conversationId, 'with namespace:', response.data.namespace)
        skipNextConversationLoadRef.current = true
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
          query: submittedMessage,
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
        // Regular non-streaming request - supports both Pinecone and CSV modes
        console.log('Sending to backend /ask:')
        console.log('  - Mode:', mode)
        console.log('  - Namespace:', selectedNamespace)
        console.log('  - File ID:', selectedFileId)
        console.log('  - Thread ID:', conversationId || 'default')
        console.log('  - Question:', userMessage.content)

        const requestData: any = {
          mode,
          thread_id: conversationId || 'default',
          messages: [{ question: userMessage.content }],
          enabled_tools: [
            ...(customerSupportEnabled ? ['customer_support'] : []),
            ...(contentOptimizerEnabled ? ['content_optimizer'] : [])
          ]
        }

        if (optimizerAttachment) {
          if (!contentOptimizerEnabled) {
            throw new Error('Enable Content + Human Approval before attaching a document')
          }
          const extracted = await apiService.extractOptimizerFile(optimizerAttachment)
          requestData.attachment = {
            filename: extracted.data.filename,
            text: extracted.data.text,
          }
        }

        if (mode === 'csv') {
          if (!selectedFileId) {
            dispatch(setError('Please select a CSV/Excel file'))
            dispatch(setLoading(false))
            return
          }
          requestData.file_id = selectedFileId
        } else {
          requestData.namespace = selectedNamespace
        }

        const response = await apiService.ask(requestData)

        console.log('Response from backend:', response.data)
        console.log('Backend mode:', response.data.mode)
        if (mode === 'csv') {
          console.log('File used:', response.data.file_used)
        } else {
          console.log('Namespace used:', response.data.namespace_used)
          console.log('Citations received:', response.data.citations)
        }

        const assistantMessage: Message & { citations?: Citation[] } = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.response || response.data.output || 'No response received',
          timestamp: new Date().toISOString(),
          sources: response.data.sources || [],
          citations: response.data.citations || [],
          toolsUsed: response.data.tools_used || [],
          evaluation: response.data.evaluation
        }

        dispatch(addMessage(assistantMessage))
        setOptimizerAttachment(null)
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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">
            {currentConversationId ? "Conversation" : "New Chat"}
          </h1>

          {/* Mode Toggle */}
          <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 bg-blue-50 rounded-lg">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <input
              type="checkbox"
              checked={mode === 'csv'}
              onChange={(e) => dispatch(setMode(e.target.checked ? 'csv' : 'pinecone'))}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-blue-700">Chat with CSV/Excel</span>
          </label>

          {mode === 'pinecone' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 bg-amber-50 rounded-lg">
                <Headphones className="w-4 h-4 text-amber-600" />
                <input
                  type="checkbox"
                  checked={customerSupportEnabled}
                  onChange={(event) => setCustomerSupportEnabled(event.target.checked)}
                  className="w-4 h-4 text-amber-600 bg-gray-100 border-gray-300 rounded focus:ring-amber-500"
                />
                <span className="text-sm font-medium text-amber-700">Customer Support</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 bg-purple-50 rounded-lg">
                <WandSparkles className="w-4 h-4 text-purple-600" />
                <input
                  type="checkbox"
                  checked={contentOptimizerEnabled}
                  onChange={(event) => {
                    setContentOptimizerEnabled(event.target.checked)
                    if (!event.target.checked) setOptimizerAttachment(null)
                  }}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-purple-700">Content + Human Approval</span>
              </label>
            </>
          )}

          {/* Conditional Dropdowns */}
          {mode === 'pinecone' ? (
            /* Namespace Dropdown */
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
                <Globe className="w-4 h-4" />
                <span className="text-gray-700">Namespace:</span>
                <span className="font-medium">{selectedNamespace}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showNamespaceDropdown ? 'rotate-180' : ''}`} />
                {currentConversationId && (
                  <span className="text-xs text-gray-400 ml-1">(locked)</span>
                )}
              </button>

              {showNamespaceDropdown && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-1 max-h-64 overflow-y-auto">
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
          ) : (
            /* CSV File Dropdown */
            <div className="relative" ref={csvDropdownRef}>
              <button
                onClick={() => setShowCsvDropdown(!showCsvDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors bg-green-100 hover:bg-green-200 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-green-700" />
                <span className="text-gray-700">File:</span>
                <span className="font-medium text-green-700">
                  {selectedFileId ? csvFiles.find(f => f.id === selectedFileId)?.original_filename || 'Select file' : 'Select file'}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showCsvDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showCsvDropdown && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-1 max-h-64 overflow-y-auto">
                    {csvFiles.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        No CSV/Excel files uploaded yet
                      </div>
                    ) : (
                      csvFiles.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => {
                            console.log('User selected file:', file.original_filename)
                            dispatch(setSelectedFileId(file.id))
                            setShowCsvDropdown(false)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors ${
                            selectedFileId === file.id ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{file.original_filename}</span>
                            <span className="text-xs text-gray-500">{file.rows} rows</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {file.columns} columns • {file.file_type.toUpperCase()}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
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
          attachment={optimizerAttachment}
          attachmentEnabled={mode === 'pinecone' && contentOptimizerEnabled}
          onAttachmentChange={setOptimizerAttachment}
        />
      </div>
    </div>
  )
}

export default ChatInterface
