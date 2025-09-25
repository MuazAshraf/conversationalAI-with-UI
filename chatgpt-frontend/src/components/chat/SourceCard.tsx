import React from 'react'
import { FileText, ExternalLink } from 'lucide-react'

interface Source {
  id: string
  content_preview: string
  metadata?: any
}

interface SourceCardProps {
  sources: Source[]
}

const SourceCard: React.FC<SourceCardProps> = ({ sources }) => {
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-semibold text-gray-700">Sources</h3>
      </div>

      <div className="space-y-2">
        {sources.map((source, index) => (
          <div
            key={source.id || index}
            className="p-3 bg-white rounded-md border border-gray-100 hover:border-blue-200 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-xs text-gray-600 line-clamp-2">
                  {source.content_preview}
                </p>
                {source.metadata && Object.keys(source.metadata).length > 0 && (
                  <div className="mt-1 text-xs text-gray-500">
                    {source.metadata.filename && (
                      <span>File: {source.metadata.filename}</span>
                    )}
                    {source.metadata.section && (
                      <span className="ml-2">{source.metadata.section}</span>
                    )}
                    {source.metadata.score && (
                      <span className="ml-2">Score: {source.metadata.score.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SourceCard