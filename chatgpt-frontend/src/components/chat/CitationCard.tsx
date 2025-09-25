import { Citation } from '../../types'
import { Tag, ChevronDown, ChevronUp, FileText, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface CitationCardProps {
  citations: Citation[]
}

const CitationCard = ({ citations }: CitationCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedPreview, setExpandedPreview] = useState<number | null>(null)

  if (!citations || citations.length === 0) return null

  // Calculate average score
  const avgScore = citations.reduce((acc, c) => acc + c.score, 0) / citations.length

  return (
    <div className="mt-3">
      {/* Single Compact Header Block */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {citations.length} Source{citations.length > 1 ? 's' : ''} Used
            </span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              {(avgScore * 100).toFixed(0)}% avg match
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="border-t border-gray-200">
            <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
              {citations.map((citation, index) => (
                <div key={index} className="border-l-2 border-gray-200 pl-3">
                  {/* Citation Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-500">
                          Source {index + 1}
                        </span>
                        <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium">
                          {(citation.score * 100).toFixed(0)}%
                        </span>
                        {/* Inline Tags */}
                        {citation.tags && citation.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {citation.tags.slice(0, 2).join(', ')}
                              {citation.tags.length > 2 && ` +${citation.tags.length - 2}`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Preview Toggle */}
                      <button
                        onClick={() => setExpandedPreview(expandedPreview === index ? null : index)}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        {expandedPreview === index ? 'Hide' : 'Show'} excerpt
                      </button>

                      {/* Preview Content */}
                      {expandedPreview === index && (
                        <div className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-600 leading-relaxed prose prose-xs max-w-none">
                          <ReactMarkdown>
                            {citation.preview}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CitationCard