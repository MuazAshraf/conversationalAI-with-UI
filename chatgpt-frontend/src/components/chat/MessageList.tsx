import { Message } from '../../types'
import MessageBubble from './MessageBubble'
import { formatTime } from '../../lib/utils'
import LoadingDots from './LoadingDots'

interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
}

const MessageList = ({ messages, isLoading }: MessageListProps) => {
  // Don't show the empty state if we're loading (processing a message)
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">How can I help you today?</h3>
          <p className="text-sm text-gray-500">Start a conversation by typing a message below.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {messages.map((message, index) => (
        <div key={message.id} className="flex flex-col">
          <MessageBubble message={message} />
          <div className="text-xs text-gray-400 mt-1 ml-4">
            {formatTime(new Date(message.timestamp))}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
            AI
          </div>
          <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
            <LoadingDots />
          </div>
        </div>
      )}
    </div>
  )
}

export default MessageList
