import { useRef, useState } from 'react'
import { Send, Loader2, Paperclip, X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
  disabled?: boolean
  attachment?: File | null
  attachmentEnabled?: boolean
  onAttachmentChange?: (file: File | null) => void
}

const ChatInput = ({ value, onChange, onSend, onKeyPress, disabled, attachment, attachmentEnabled, onAttachmentChange }: ChatInputProps) => {
  const [isFocused, setIsFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cannotSend = disabled || (!value.trim() && !attachment)

  return (
    <div className="space-y-2">
      {attachment && (
        <div className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm text-purple-800">
          <Paperclip className="h-4 w-4" />
          <span className="max-w-xs truncate">{attachment.name}</span>
          <button type="button" onClick={() => onAttachmentChange?.(null)} disabled={disabled} title="Remove attachment">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={cn(
        "flex items-end gap-2 p-3 border rounded-lg transition-colors",
        isFocused ? "border-blue-500" : "border-gray-300",
        disabled && "opacity-50 cursor-not-allowed"
      )}>
      {attachmentEnabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx"
            className="hidden"
            onChange={(event) => onAttachmentChange?.(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-purple-50 hover:text-purple-700"
            title="Attach PDF, TXT, or DOCX"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </>
      )}
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
        disabled={cannotSend}
        className={cn(
          "p-2 rounded-lg transition-colors",
          cannotSend
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
    </div>
  )
}

export default ChatInput
