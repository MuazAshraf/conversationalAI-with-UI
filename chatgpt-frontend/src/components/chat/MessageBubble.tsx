import { Message } from '../../types'
import { cn } from '../../lib/utils'
import { User, Bot, Wrench } from 'lucide-react'
import SourceCard from './SourceCard'
import CitationCard from './CitationCard'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MessageBubbleProps {
  message: Message
}

const MessageBubble = ({ message }: MessageBubbleProps) => {
  const isUser = message.role === 'user'

  // Detect if content contains Urdu text
  const hasUrdu = /[\u0600-\u06FF\u0750-\u077F]/.test(message.content)
  const contentClass = hasUrdu ? 'urdu-text' : ''
  const toolLabels: Record<string, string> = {
    retrieve_documents: 'Document Search',
    document_search: 'Document Search',
    web_search: 'Web Search',
    tavily_search: 'Web Search',
    customer_support: 'Customer Support',
    content_optimizer: 'Content Optimizer',
  }

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
          isUser ? "max-w-[80%]" : "w-full max-w-5xl",
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="my-4 overflow-x-auto rounded-lg border border-gray-200">
                      <table className="m-0 min-w-full border-collapse text-left text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-gray-200">{children}</thead>,
                  th: ({ children }) => <th className="border-b border-r border-gray-300 px-3 py-2 font-semibold last:border-r-0">{children}</th>,
                  td: ({ children }) => <td className="border-b border-r border-gray-200 px-3 py-2 align-top last:border-r-0">{children}</td>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={isUser ? "font-medium text-white underline" : "text-blue-600 underline"}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          {!isUser && message.toolsUsed && message.toolsUsed.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1 font-medium">
                <Wrench className="w-3.5 h-3.5" />
                Tools used:
              </span>
              {message.toolsUsed.map((tool) => (
                <span
                  key={tool}
                  className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700"
                >
                  {toolLabels[tool] || tool.split('_').join(' ')}
                </span>
              ))}
            </div>
          )}

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
