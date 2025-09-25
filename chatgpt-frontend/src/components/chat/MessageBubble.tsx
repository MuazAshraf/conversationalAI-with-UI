import { Message } from '../../types'
import { cn } from '../../lib/utils'
import { User, Bot } from 'lucide-react'
import SourceCard from './SourceCard'
import CitationCard from './CitationCard'
import ReactMarkdown from 'react-markdown'

interface MessageBubbleProps {
  message: Message
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === 'user'

  // Detect if content contains Urdu text
  const hasUrdu = /[\u0600-\u06FF\u0750-\u077F]/.test(message.content)
  const contentClass = hasUrdu ? 'urdu-text' : ''

  return (
    <div>
      <div className={cn(
        "flex gap-3",
        isUser ? "justify-end" : "justify-start"
      )}>
        {/* Avatar */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Message Content */}
        <div className={cn(
          "max-w-[70%]",
          isUser ? "" : ""
        )}>
          <div className={cn(
            "rounded-lg px-4 py-2",
            isUser
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-900"
          )}>
            <div className={cn("prose prose-sm max-w-none", contentClass,
              isUser ? "prose-invert" : "prose-gray"
            )}>
              <ReactMarkdown>
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Show citations for assistant messages */}
          {!isUser && message.citations && message.citations.length > 0 && (
            <CitationCard citations={message.citations} />
          )}

          {/* Show sources for assistant messages (fallback) */}
          {!isUser && !message.citations && message.sources && message.sources.length > 0 && (
            <SourceCard sources={message.sources} />
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
