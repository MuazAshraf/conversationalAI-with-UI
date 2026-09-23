import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
  disabled?: boolean
}

const ChatInput = ({ value, onChange, onSend, onKeyPress, disabled }: ChatInputProps) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className={cn(
      "flex items-end gap-2 p-3 border rounded-lg transition-colors",
      isFocused ? "border-blue-500" : "border-gray-300",
      disabled && "opacity-50 cursor-not-allowed"
    )}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={onKeyPress}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Type your message here..."
        disabled={disabled}
        className="flex-1 resize-none appearance-none border-0 bg-transparent p-0 text-sm placeholder-gray-500 max-h-32 focus:border-0 focus:outline-none focus:ring-0"
        rows={1}
        style={{
          height: 'auto',
          minHeight: '24px',
          border: 0,
          outline: 'none',
          boxShadow: 'none',
        }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement
          target.style.height = 'auto'
          target.style.height = `${target.scrollHeight}px`
        }}
      />
      
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className={cn(
          "p-2 rounded-lg transition-colors",
          disabled || !value.trim()
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        )}
      >
        {disabled ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </div>
  )
}

export default ChatInput
