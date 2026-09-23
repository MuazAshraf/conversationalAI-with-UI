import { Citation } from '../../types'
import { Tag, ChevronDown, ChevronUp, FileText, CheckCircle, ExternalLink, FileType } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Helper to get relevance color (LangChain PineconeRerank provides normalized 0-1 scores)
const getRelevanceColor = (relevance?: string, score?: number) => {
  if (relevance === 'High' || (score && score > 0.7)) return 'bg-green-100 text-green-700'
  if (relevance === 'Medium' || (score && score > 0.4)) return 'bg-yellow-100 text-yellow-700'
  return 'bg-orange-100 text-orange-600'
}

// Helper to get file type icon color
const getFileTypeColor = (fileType?: string) => {
  switch (fileType?.toUpperCase()) {
    case 'PDF': return 'text-red-500'
    case 'TXT': return 'text-blue-500'
    case 'DOC':
    case 'DOCX': return 'text-blue-600'
    default: return 'text-gray-500'
  }
}

interface CitationCardProps {
  citations: Citation[]
}

const CitationCard = ({ citations }: CitationCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedPreview, setExpandedPreview] = useState<number | null>(null)

  if (!citations || citations.length === 0) return null

  // Count relevance levels (normalized 0-1 scores from LangChain PineconeRerank)
  const highCount = citations.filter(c => c.source_type !== 'web' && (c.relevance === 'High' || c.score > 0.7)).length
  const mediumCount = citations.filter(c => c.source_type !== 'web' && (c.relevance === 'Medium' || (c.score > 0.4 && c.score <= 0.7)) && c.relevance !== 'High').length
  const webCount = citations.filter(c => c.source_type === 'web').length
  const documentCount = citations.length - webCount

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
              {citations.length} Source{citations.length > 1 ? 's' : ''}
            </span>
            {documentCount > 0 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                {documentCount} Document{documentCount > 1 ? 's' : ''}
              </span>
            )}
            {webCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                {webCount} Web
              </span>
            )}
            {highCount > 0 && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                {highCount} High
              </span>
            )}
            {mediumCount > 0 && (
              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                {mediumCount} Medium
              </span>
            )}
            {documentCount > 0 && highCount === 0 && mediumCount === 0 && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-semibold">
                Low relevance
              </span>
            )}
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
                <div key={index} className="border-l-2 border-blue-200 pl-3 py-1">
                  {/* Citation Header Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* File Type Badge */}
                    {citation.file_type && (
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${getFileTypeColor(citation.file_type)} bg-gray-50`}>
                        <FileType className="w-3 h-3" />
                        {citation.file_type}
                      </span>
                    )}

                    {/* Title */}
                    {citation.url ? (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-[320px] items-center gap-1 truncate text-sm font-medium text-blue-700 hover:underline"
                        title={citation.title}
                      >
                        {citation.title || `Source ${index + 1}`}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="max-w-[320px] truncate text-sm font-medium text-gray-800" title={citation.title}>
                        {citation.title || `Source ${index + 1}`}
                      </span>
                    )}

                    {/* Page Number */}
                    {citation.page && (
                      <span className="text-xs text-gray-500">
                        p.{citation.page}
                      </span>
                    )}

                    {/* Relevance Badge */}
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${citation.source_type === 'web' ? 'bg-blue-100 text-blue-700' : getRelevanceColor(citation.relevance, citation.score)}`}>
                      {citation.source_type === 'web' ? 'Web' : citation.relevance || (citation.score > 0.7 ? 'High' : citation.score > 0.4 ? 'Medium' : 'Low')}
                    </span>

                    {/* Score Percentage */}
                    <span className="text-xs text-gray-500 font-medium">
                      {(citation.score * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Category & Tags Row */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {citation.category && citation.category !== 'general' && (
                      <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">
                        {citation.category}
                      </span>
                    )}
                    {citation.tags && citation.tags.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-gray-400" />
                        {citation.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                        {citation.tags.length > 3 && (
                          <span className="text-xs text-gray-400">+{citation.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Preview Toggle */}
                  <button
                    onClick={() => setExpandedPreview(expandedPreview === index ? null : index)}
                    className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                  >
                    {expandedPreview === index ? 'Hide' : 'Show'} excerpt
                  </button>

                  {/* Preview Content */}
                  {expandedPreview === index && (
                    <div className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-600 leading-relaxed prose prose-xs max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {citation.preview}
                      </ReactMarkdown>
                    </div>
                  )}
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
